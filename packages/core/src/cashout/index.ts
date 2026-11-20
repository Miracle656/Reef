/**
 * Cash-out: turn the wallet's dollars (USDC / USDSUI on Sui) into naira in a
 * Nigerian bank account, through Linq's offramp API.
 *
 * This file is the client-safe half: the request shapes the apps sign and send
 * to ReeF's own server, the bank list, and status/amount helpers. The half that
 * holds the Linq API key lives in `@umbra/core/server` (`./linq`, `./service`).
 *
 * The flow never takes custody. ReeF's server asks Linq for an order, which
 * comes back with a one-time deposit address; the user's wallet then sends the
 * dollars straight to that address, and Linq pays the bank account.
 *
 * Every request is a personal message signed by the wallet's own key, so only
 * the owner of an address can look up bank names, create orders or read them.
 */
import { z } from "zod";

// ---- coins ------------------------------------------------------------------

/** Linq's names for the two dollars it accepts on Sui. */
export const CASHOUT_COINS = ["usdc", "usdsui"] as const;
export type CashoutCoin = (typeof CASHOUT_COINS)[number];

/** Wallet coin symbol ("USDC") -> Linq coin ("usdc"), or null if Linq doesn't take it. */
export function cashoutCoinFor(symbol: string): CashoutCoin | null {
  const s = symbol.toLowerCase();
  return (CASHOUT_COINS as readonly string[]).includes(s) ? (s as CashoutCoin) : null;
}

// ---- banks ------------------------------------------------------------------

export interface Bank {
  /** Nigerian bank code, as Linq expects it */
  code: string;
  name: string;
}

/**
 * The banks listed in Linq's API guide. Linq supports 32 in total; the rest are
 * in its `nigerian-banks.json`, which should replace this list when we have it.
 */
export const BANKS: readonly Bank[] = [
  { code: "044", name: "Access Bank" },
  { code: "214", name: "FCMB" },
  { code: "070", name: "Fidelity Bank" },
  { code: "011", name: "First Bank" },
  { code: "058", name: "GTBank" },
  { code: "090267", name: "Kuda" },
  { code: "090405", name: "Moniepoint" },
  { code: "100004", name: "OPay" },
  { code: "100033", name: "PalmPay" },
  { code: "076", name: "Polaris Bank" },
  { code: "039", name: "Stanbic IBTC" },
  { code: "232", name: "Sterling Bank" },
  { code: "033", name: "UBA" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
];

/** Nigerian (NUBAN) account numbers are exactly 10 digits. */
export function isAccountNumber(value: string): boolean {
  return /^\d{10}$/.test(value);
}

/** `"1234567890"` -> `"******7890"`: what we store and show after the order is made. */
export function maskAccountNumber(accountNumber: string): string {
  return accountNumber.length <= 4 ? accountNumber : "*".repeat(accountNumber.length - 4) + accountNumber.slice(-4);
}

// ---- status -----------------------------------------------------------------

/**
 * Where an order is, from the user's point of view:
 * - `awaiting_deposit`: order made, the dollars haven't arrived at Linq yet
 * - `processing`: Linq has the dollars and is paying the bank
 * - `paid`: the naira has been sent
 * - `failed`: the bank payout failed (Linq returns the dollars to the wallet)
 * - `expired`: no deposit arrived within the 10-minute window
 */
export type CashoutStatus = "awaiting_deposit" | "processing" | "paid" | "failed" | "expired";

export const TERMINAL_STATUSES: readonly CashoutStatus[] = ["paid", "failed", "expired"];
export const isTerminal = (s: CashoutStatus): boolean => TERMINAL_STATUSES.includes(s);

/** Linq gives each order 10 minutes to receive its deposit. */
export const DEPOSIT_WINDOW_MS = 10 * 60_000;

/**
 * Linq reports status as free text, not an enum. Map the documented strings;
 * return null for anything unrecognised so the caller keeps what it had.
 */
export function normalizeLinqStatus(raw: string): CashoutStatus | null {
  const s = raw.trim().toLowerCase();
  if (s === "initiated") return "awaiting_deposit";
  if (s.startsWith("timeout")) return "expired";
  if (s === "failed") return "failed";
  if (s === "disbursed" || s === "settled in treasury") return "paid";
  if (s.startsWith("processing")) {
    // "processing: wallet worker on it.." = still watching for the deposit;
    // "processing: in bank queue" = deposit confirmed, payout queued.
    return s.includes("wallet worker") ? "awaiting_deposit" : "processing";
  }
  return null;
}

// ---- signed requests --------------------------------------------------------

/** A full, lower-case Sui address. Short forms are refused: they'd be ambiguous in a signed message. */
const Owner = z.string().regex(/^0x[0-9a-f]{64}$/, "expected a full lower-case Sui address");
const OrderId = z.string().uuid();
const BankCode = z.string().regex(/^\d{3,6}$/, "expected a bank code");
const AccountNumber = z.string().regex(/^\d{10}$/, "expected a 10-digit account number");
/** A plain money amount with at most 2 decimal places: Linq works to the cent / kobo. */
const Amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "expected an amount with at most 2 decimals");
const Timestamp = z.number().int().positive();
/** A Sui transaction digest (base58). */
const Digest = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,64}$/, "expected a transaction digest");

export const CashoutMessageSchema = z.discriminatedUnion("action", [
  /** Look up the name on a bank account, so the user can confirm it before paying. */
  z.object({ action: z.literal("verify-bank"), owner: Owner, bankCode: BankCode, accountNumber: AccountNumber, timestamp: Timestamp }),
  /**
   * Create an order. `orderId` is chosen by the client and makes a retry safe:
   * sending the same request twice returns the same order.
   * `amountKind: "ngn"` = "pay out exactly this many naira"; `"stable"` = "sell this many dollars".
   */
  z.object({
    action: z.literal("create"),
    owner: Owner,
    orderId: OrderId,
    coin: z.enum(CASHOUT_COINS),
    amountKind: z.enum(["ngn", "stable"]),
    amount: Amount,
    bankCode: BankCode,
    accountNumber: AccountNumber,
    timestamp: Timestamp,
  }),
  /** Tell the server which transaction paid the order's deposit address. */
  z.object({ action: z.literal("deposit"), owner: Owner, orderId: OrderId, digest: Digest, timestamp: Timestamp }),
  /** Read one order (refreshes its status from Linq). */
  z.object({ action: z.literal("get"), owner: Owner, orderId: OrderId, timestamp: Timestamp }),
  /** The owner's recent orders. */
  z.object({ action: z.literal("list"), owner: Owner, timestamp: Timestamp }),
]);
export type CashoutMessage = z.infer<typeof CashoutMessageSchema>;

/**
 * How long one confirmation lets a wallet use cash-out (a "session").
 *
 * A request can carry its own signature, but a passkey wallet shows a prompt
 * for every signature, and one cash-out is five or more requests plus a status
 * check every few seconds. So the wallet may instead sign once and send that
 * one signature with each request until it runs out. A session only opens this
 * API for its own wallet: money still moves by a transaction the wallet signs
 * separately, on its own prompt.
 */
export const CASHOUT_SESSION_MS = 30 * 60_000;

export const CashoutSessionSchema = z.object({
  /** when the wallet signed it (ms) */
  issuedAt: Timestamp,
  /** base64 personal-message signature by the owner over {@link canonicalCashoutSessionBytes} */
  signature: z.string().min(1),
});
export type CashoutSession = z.infer<typeof CashoutSessionSchema>;

/** A request is proven either by its own signature or by a session. */
export const SignedCashoutSchema = z.union([
  z.object({
    message: CashoutMessageSchema,
    /** base64 personal-message signature by `message.owner` over {@link canonicalCashoutBytes} */
    signature: z.string().min(1),
  }),
  z.object({ message: CashoutMessageSchema, session: CashoutSessionSchema }),
]);
export type SignedCashout = z.infer<typeof SignedCashoutSchema>;

/**
 * The exact bytes the wallet signs. Every field is in the string and none can
 * contain ":", so one signature can't be replayed as a different request.
 */
export function canonicalCashoutBytes(m: CashoutMessage): Uint8Array {
  const head = `reef:cashout:${m.action}:${m.owner}`;
  let body: string;
  switch (m.action) {
    case "verify-bank":
      body = `${m.bankCode}:${m.accountNumber}`;
      break;
    case "create":
      body = `${m.orderId}:${m.coin}:${m.amountKind}:${m.amount}:${m.bankCode}:${m.accountNumber}`;
      break;
    case "deposit":
      body = `${m.orderId}:${m.digest}`;
      break;
    case "get":
      body = m.orderId;
      break;
    case "list":
      body = "";
      break;
  }
  return new TextEncoder().encode(`${head}:${body}:${m.timestamp}`);
}

/**
 * The exact bytes a wallet signs to open a session on `network`. "session" is
 * not an action, so this can never be read as a request, nor a request as this.
 */
export function canonicalCashoutSessionBytes(network: string, owner: string, issuedAt: number): Uint8Array {
  return new TextEncoder().encode(`reef:cashout:session:${network}:${owner}:${issuedAt}`);
}

// ---- what the server answers -------------------------------------------------

export interface BankAccountName {
  bankCode: string;
  bankName: string;
  /** the name the bank holds for this account */
  accountName: string;
}

/** An order as the apps see it. Money is in strings so nothing is lost in JSON. */
export interface CashoutOrderView {
  id: string;
  status: CashoutStatus;
  coin: CashoutCoin;
  /** full Move coin type to send */
  coinType: string;
  /** one-time address to send the dollars to */
  depositAddress: string;
  /** dollars to send, in the coin's base units */
  amountStable: string;
  /** naira the bank account receives, e.g. "82750.00" */
  amountNgn: string;
  /** naira per dollar, locked when the order was made */
  rate: string;
  bankName: string;
  accountName: string;
  /** e.g. "******7890" */
  accountNumberMasked: string;
  /** the transaction that paid the deposit address, once the app reports it */
  depositDigest: string | null;
  createdAtMs: number;
  /** the deposit must arrive before this */
  expiresAtMs: number;
  updatedAtMs: number;
}

export interface CashoutRate {
  /** naira per dollar right now. Indicative: the real rate is locked when an order is made. */
  rate: number;
  atMs: number;
}

/** What `POST /api/cashout` returns for each action. */
export type CashoutResponse =
  | { action: "verify-bank"; account: BankAccountName }
  | { action: "create"; order: CashoutOrderView }
  | { action: "deposit"; order: CashoutOrderView }
  | { action: "get"; order: CashoutOrderView }
  | { action: "list"; orders: CashoutOrderView[] };

// ---- amounts ----------------------------------------------------------------

/**
 * Dollars needed to pay out `ngn` at `rate`, the way Linq computes it: rounded
 * UP to the cent, so the payout is never short. Returns cents.
 */
export function centsForNgn(ngnKobo: bigint, rate: number): bigint {
  if (!(rate > 0)) throw new Error("rate must be positive");
  // work in integers: rate to 4 decimal places
  const rateE4 = BigInt(Math.round(rate * 10_000));
  // cents = ceil(ngn / rate * 100) = ceil(kobo * 10_000 / rateE4)
  return (ngnKobo * 10_000n + rateE4 - 1n) / rateE4;
}

/** Naira (in kobo, rounded down) that `cents` of dollars pays out at `rate`. */
export function koboForCents(cents: bigint, rate: number): bigint {
  if (!(rate > 0)) throw new Error("rate must be positive");
  const rateE4 = BigInt(Math.round(rate * 10_000));
  return (cents * rateE4) / 10_000n;
}

/** `"2000"` / `"2000.5"` -> hundredths (kobo or cents) as a bigint. */
export function toHundredths(amount: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new Error("expected an amount with at most 2 decimals");
  return BigInt(m[1]!) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

/** Hundredths -> `"2000.50"`. */
export function fromHundredths(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}
