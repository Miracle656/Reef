/**
 * SERVER-ONLY. The cash-out rules, independent of any web framework, database
 * driver or network: everything it touches is passed in, so the whole flow is
 * unit-tested with a fake Linq and an in-memory store.
 *
 * What it guarantees:
 * - every request is proven to come from the wallet that owns the order, by its
 *   own signature or by a session that wallet signed, and is recent
 * - an order can be read or changed only by the address that made it
 * - order creation is idempotent (the client's order id is Linq's idempotency
 *   key) and throttled per address, because Linq rate-limits our whole key
 * - the bank account name is looked up here, never trusted from the client
 * - Linq's answer is checked (right chain, right coin, a real address, numbers
 *   that add up) before the app is ever told where to send money
 * - a status never moves backwards and a finished order never changes
 */
import { isValidSuiAddress, normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";
import { toBaseUnits } from "../wallet/index";
import {
  canonicalCashoutBytes,
  canonicalCashoutSessionBytes,
  CASHOUT_SESSION_MS,
  centsForNgn,
  DEPOSIT_WINDOW_MS,
  fromHundredths,
  isTerminal,
  maskAccountNumber,
  normalizeLinqStatus,
  SignedCashoutSchema,
  toHundredths,
  type CashoutCoin,
  type CashoutMessage,
  type CashoutOrderView,
  type CashoutRate,
  type CashoutResponse,
  type CashoutStatus,
} from "./index";
import { LinqError, LinqWebhookEventSchema, verifyLinqSignature, type LinqClient, type LinqOfframpOrder } from "./linq";
import type { CashoutOrderPatch, CashoutOrderRow, CashoutStore } from "./store";

export type CashoutErrorCode = "bad_request" | "unauthorized" | "not_found" | "limit" | "throttled" | "provider" | "unavailable";

/** An error whose message is safe and useful to show the user. */
export class CashoutError extends Error {
  constructor(
    readonly code: CashoutErrorCode,
    message: string,
    /** HTTP status for the route handler */
    readonly status: number,
  ) {
    super(message);
    this.name = "CashoutError";
  }
}

export interface CashoutCoinInfo {
  /** the coin's Move type on the wallet's network */
  type: string;
  decimals: number;
}

export interface CashoutServiceConfig {
  /** the wallet network orders are funded on */
  network: string;
  /** coins that can be cashed out, with the type we expect Linq to ask for */
  coins: Partial<Record<CashoutCoin, CashoutCoinInfo>>;
  /** smallest order, in cents (default $1.00) */
  minCents?: bigint;
  /** largest order, in cents (default $500.00) */
  maxCents?: bigint;
  /** orders one address may create per 10 minutes (default 3) */
  maxOrdersPer10Min?: number;
  /** orders one address may create per 24 hours (default 20) */
  maxOrdersPerDay?: number;
  /** how far a request's timestamp may be from the server clock (default 5 minutes) */
  maxSkewMs?: number;
  /** how long a session signature is honoured (default 30 minutes) */
  sessionMs?: number;
  /** Linq webhook signing secret; webhooks are refused without it */
  webhookSecret?: string;
  /**
   * If set, only these wallets (full lower-case addresses) may use cash-out;
   * everyone else is told it isn't available. Used to rehearse on mainnet,
   * where the stand-in for Linq would otherwise take real dollars from anyone.
   */
  allowedOwners?: ReadonlySet<string>;
}

export interface CashoutServiceDeps {
  store: CashoutStore;
  linq: LinqClient;
  /** True iff `signature` is `owner`'s valid personal-message signature over `bytes`. */
  verifyOwner: (owner: string, bytes: Uint8Array, signature: string) => Promise<boolean>;
  config: CashoutServiceConfig;
  now?: () => number;
  log?: (message: string) => void;
}

export interface CashoutService {
  /** Indicative naira-per-dollar rate, cached briefly. */
  rate(): Promise<CashoutRate>;
  /** Handle one request (the parsed JSON body of `POST /api/cashout`): `{ message, signature }` or `{ message, session }`. */
  handle(body: unknown): Promise<CashoutResponse>;
  /** Handle a Linq webhook. Returns the HTTP status to answer with. */
  webhook(rawBody: string, signatureHeader: string | null | undefined): Promise<number>;
  /** Whether `owner` may use cash-out at all (see `allowedOwners`). */
  allows(owner: string): boolean;
}

const TEN_MINUTES = 10 * 60_000;
const DAY = 24 * 60 * 60_000;
const RATE_TTL_MS = 30_000;
const RATE_STALE_OK_MS = 10 * 60_000;
/** don't ask Linq about the same order more often than this */
const REFRESH_EVERY_MS = 4_000;
const VERIFY_BANK_PER_MINUTE = 10;
const LIST_LIMIT = 20;
/** sessions this instance has already verified (see `sessionIsValid`) */
const MAX_KNOWN_SESSIONS = 500;

const RANK: Record<CashoutStatus, number> = { awaiting_deposit: 0, processing: 1, paid: 2, failed: 2, expired: 2 };

/**
 * A status only moves forward. "paid" is final and can't be undone; anything
 * else may still become "paid", because money arriving is the strongest fact
 * (a payout Linq first reported failed, then completed on retry).
 */
function canMove(from: CashoutStatus, to: CashoutStatus): boolean {
  if (from === to || from === "paid") return false;
  return to === "paid" || RANK[to] > RANK[from];
}

function view(r: CashoutOrderRow): CashoutOrderView {
  return {
    id: r.id,
    status: r.status,
    coin: r.coin,
    coinType: r.coinType,
    depositAddress: r.depositAddress,
    amountStable: r.amountStable.toString(),
    amountNgn: r.amountNgn,
    rate: r.rate,
    bankName: r.bankName,
    accountName: r.accountName,
    accountNumberMasked: r.accountNumberMasked,
    depositDigest: r.depositDigest,
    createdAtMs: r.createdAtMs,
    expiresAtMs: r.expiresAtMs,
    updatedAtMs: r.updatedAtMs,
  };
}

const dollars = (cents: bigint) => `$${fromHundredths(cents)}`;

export function createCashoutService(deps: CashoutServiceDeps): CashoutService {
  const { store, linq, verifyOwner, config } = deps;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const minCents = config.minCents ?? 100n;
  const maxCents = config.maxCents ?? 50_000n;
  const maxPer10 = config.maxOrdersPer10Min ?? 3;
  const maxPerDay = config.maxOrdersPerDay ?? 20;
  const maxSkew = config.maxSkewMs ?? 5 * 60_000;
  const sessionMs = config.sessionMs ?? CASHOUT_SESSION_MS;

  let cachedRate: CashoutRate | null = null;
  const bankLookups = new Map<string, number[]>();

  async function rate(): Promise<CashoutRate> {
    const t = now();
    if (cachedRate && t - cachedRate.atMs < RATE_TTL_MS) return cachedRate;
    try {
      const r = await linq.getRate();
      cachedRate = { rate: r.rate, atMs: t };
      return cachedRate;
    } catch (e) {
      // A slightly old rate is fine for an estimate; the real one is locked per order.
      if (cachedRate && t - cachedRate.atMs < RATE_STALE_OK_MS) return cachedRate;
      log(`[cashout] rate failed: ${e instanceof Error ? e.message : String(e)}`);
      throw new CashoutError("provider", "We couldn't get today's rate. Try again in a minute.", 502);
    }
  }

  /** dollars as Linq reports them (a JSON number) -> the coin's base units, exactly */
  function toBase(amount: number, decimals: number): bigint {
    return toBaseUnits(amount.toFixed(Math.min(decimals, 6)), decimals);
  }

  /** Refuse to hand the app a deposit address unless Linq's order is what we asked for. */
  function checkOrder(order: LinqOfframpOrder, m: Extract<CashoutMessage, { action: "create" }>, coin: CashoutCoinInfo): { amountStable: bigint; depositAddress: string } {
    const fail = (why: string): never => {
      log(`[cashout] REJECTED Linq order ${order.id} for ${m.orderId}: ${why}`);
      throw new CashoutError("provider", "The payout provider sent back an order we couldn't verify, so nothing was started. Try again.", 502);
    };
    if (order.chain !== undefined && order.chain.toLowerCase() !== "sui") fail(`chain is ${order.chain}`);
    if (order.coin.toLowerCase() !== m.coin) fail(`coin is ${order.coin}`);
    let sameType = false;
    try {
      sameType = normalizeStructTag(order.coinType) === normalizeStructTag(coin.type);
    } catch {
      /* not a Move type at all */
    }
    if (!sameType) fail(`coin type is ${order.coinType}`);
    if (!/^0x[0-9a-fA-F]{64}$/.test(order.walletAddress) || !isValidSuiAddress(order.walletAddress)) fail("deposit address isn't a Sui address");
    const depositAddress = normalizeSuiAddress(order.walletAddress);
    if (depositAddress === m.owner) fail("deposit address is the owner's own address");

    const amountStable = toBase(order.amountStableCoin, coin.decimals);
    if (amountStable <= 0n) fail("amount is zero");
    // back to cents, to hold the order to the same ceiling the request was held to
    const cents = amountStable / 10n ** BigInt(coin.decimals - 2);
    if (cents > maxCents + maxCents / 50n + 1n) fail(`amount ${order.amountStableCoin} is over the limit`);
    // dollars x rate should be the naira, give or take Linq's rounding up to the cent
    const tolerance = Math.max(0.011 * order.rate + 1, order.amountNGN * 0.001);
    if (Math.abs(order.amountStableCoin * order.rate - order.amountNGN) > tolerance) {
      fail(`quote doesn't add up: ${order.amountStableCoin} x ${order.rate} vs ${order.amountNGN}`);
    }
    return { amountStable, depositAddress };
  }

  async function ownedOrder(owner: string, orderId: string): Promise<CashoutOrderRow> {
    const row = await store.get(orderId);
    // Same answer for "doesn't exist" and "isn't yours": don't confirm other people's order ids.
    if (!row || row.owner !== owner) throw new CashoutError("not_found", "We couldn't find that cash-out.", 404);
    return row;
  }

  async function apply(row: CashoutOrderRow, patch: CashoutOrderPatch): Promise<CashoutOrderRow> {
    // Drop "no change" entries first: an undefined value must never overwrite a field below.
    const next = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as CashoutOrderPatch;
    if (next.status !== undefined && !canMove(row.status, next.status)) delete next.status;
    // Settled amounts describe a payout: keep them only on an order that is (or just became) paid.
    if ((next.status ?? row.status) !== "paid") {
      delete next.settledStable;
      delete next.settledNgn;
    }
    const changed = Object.entries(next).some(([k, v]) => (row as unknown as Record<string, unknown>)[k] !== v);
    if (!changed) return row;
    if (next.status !== undefined || next.depositDigest !== undefined) next.updatedAtMs = now();
    await store.update(row.id, next);
    return { ...row, ...next } as CashoutOrderRow;
  }

  /** Ask Linq where the order is, unless it's finished or we asked a moment ago. */
  async function refresh(row: CashoutOrderRow): Promise<CashoutOrderRow> {
    const t = now();
    if (isTerminal(row.status) || t - row.refreshedAtMs < REFRESH_EVERY_MS) return row;
    try {
      const s = await linq.getStatus(row.linqOrderId);
      const status = normalizeLinqStatus(s.status) ?? undefined;
      const patch: CashoutOrderPatch = { linqStatus: s.status, refreshedAtMs: t, status };
      if (status === "paid") {
        const decimals = config.coins[row.coin]?.decimals ?? 6;
        if (s.amountStableCoin !== undefined && s.amountStableCoin > 0) patch.settledStable = toBase(s.amountStableCoin, decimals);
        if (s.amountNGN !== undefined && s.amountNGN > 0) patch.settledNgn = s.amountNGN.toFixed(2);
      }
      return await apply(row, patch);
    } catch (e) {
      // Linq being unreachable must not break reading an order: show what we have.
      log(`[cashout] status refresh failed for ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      return row;
    }
  }

  async function verifyBank(m: Extract<CashoutMessage, { action: "verify-bank" }>): Promise<CashoutResponse> {
    const t = now();
    const recent = (bankLookups.get(m.owner) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= VERIFY_BANK_PER_MINUTE) throw new CashoutError("throttled", "Too many lookups. Wait a minute and try again.", 429);
    recent.push(t);
    bankLookups.set(m.owner, recent);
    const account = await lookupAccount(m.bankCode, m.accountNumber);
    return { action: "verify-bank", account: { bankCode: m.bankCode, bankName: account.bankName, accountName: account.accountName } };
  }

  async function lookupAccount(bankCode: string, accountNumber: string) {
    try {
      return await linq.verifyBank({ bankCode, accountNumber });
    } catch (e) {
      if (e instanceof LinqError && !e.transient && e.status !== 401 && e.status !== 403) {
        throw new CashoutError("bad_request", "We couldn't find that account. Check the bank and the account number.", 400);
      }
      log(`[cashout] verify-bank failed: ${e instanceof Error ? e.message : String(e)}`);
      throw new CashoutError("provider", "We couldn't check that account right now. Try again in a minute.", 502);
    }
  }

  async function create(m: Extract<CashoutMessage, { action: "create" }>): Promise<CashoutResponse> {
    // A retry of the same request gets the same order back.
    const existing = await store.get(m.orderId);
    if (existing) {
      if (existing.owner !== m.owner) throw new CashoutError("not_found", "We couldn't find that cash-out.", 404);
      return { action: "create", order: view(existing) };
    }

    const coin = config.coins[m.coin];
    if (!coin) throw new CashoutError("bad_request", "That coin can't be cashed out here.", 400);

    const t = now();
    if ((await store.countSince(m.owner, t - TEN_MINUTES)) >= maxPer10) {
      throw new CashoutError("throttled", "You've started a few cash-outs in a row. Finish one, or wait 10 minutes.", 429);
    }
    if ((await store.countSince(m.owner, t - DAY)) >= maxPerDay) {
      throw new CashoutError("throttled", "You've reached today's cash-out limit. Try again tomorrow.", 429);
    }

    // Hold the request to the limits before we spend one of Linq's orders on it.
    const cents = m.amountKind === "stable" ? toHundredths(m.amount) : centsForNgn(toHundredths(m.amount), (await rate()).rate);
    if (cents < minCents) throw new CashoutError("limit", `The smallest cash-out is ${dollars(minCents)}.`, 400);
    if (cents > maxCents) throw new CashoutError("limit", `The most you can cash out at once is ${dollars(maxCents)}.`, 400);

    // The name on the account comes from the bank lookup, not from the client.
    const account = await lookupAccount(m.bankCode, m.accountNumber);

    let order: LinqOfframpOrder;
    try {
      order = await linq.createOfframp({
        ...(m.amountKind === "ngn" ? { amountNGN: Number(m.amount) } : { amountStableCoin: Number(m.amount) }),
        coin: m.coin,
        bankAccount: m.accountNumber,
        bankCode: m.bankCode,
        bankName: account.bankName,
        accountName: account.accountName,
        refundAddress: m.owner,
        customerRef: m.owner,
        idempotencyKey: m.orderId,
      });
    } catch (e) {
      log(`[cashout] create failed for ${m.orderId}: ${e instanceof Error ? e.message : String(e)}`);
      if (e instanceof LinqError && e.status === 429) throw new CashoutError("unavailable", "Cash-out is busy right now. Try again in a minute.", 503);
      throw new CashoutError("provider", "The payout provider couldn't start this cash-out. Nothing was sent. Try again in a minute.", 502);
    }

    const { amountStable, depositAddress } = checkOrder(order, m, coin);
    const row: CashoutOrderRow = {
      id: m.orderId,
      owner: m.owner,
      network: config.network,
      linqOrderId: order.id,
      coin: m.coin,
      coinType: coin.type,
      depositAddress,
      amountStable,
      amountNgn: order.amountNGN.toFixed(2),
      rate: String(order.rate),
      bankCode: m.bankCode,
      bankName: account.bankName,
      accountName: account.accountName,
      accountNumberMasked: maskAccountNumber(m.accountNumber),
      status: normalizeLinqStatus(order.status) ?? "awaiting_deposit",
      linqStatus: order.status,
      depositDigest: null,
      depositAtMs: null,
      settledStable: null,
      settledNgn: null,
      createdAtMs: t,
      expiresAtMs: t + DEPOSIT_WINDOW_MS,
      updatedAtMs: t,
      refreshedAtMs: t,
    };
    // Two identical requests can race; whichever lost reads the winner's row.
    const inserted = await store.insert(row);
    const saved = inserted ? row : await store.get(m.orderId);
    if (!saved || saved.owner !== m.owner) throw new CashoutError("provider", "We couldn't save this cash-out. Nothing was sent. Try again.", 500);
    log(`[cashout] created ${saved.id} linq=${saved.linqOrderId} owner=${saved.owner} ${saved.coin} ${saved.amountStable}`);
    return { action: "create", order: view(saved) };
  }

  async function deposit(m: Extract<CashoutMessage, { action: "deposit" }>): Promise<CashoutResponse> {
    let row = await ownedOrder(m.owner, m.orderId);
    // The first reported transaction is kept; later reports can't overwrite it.
    if (!row.depositDigest) row = await apply(row, { depositDigest: m.digest, depositAtMs: now() });
    return { action: "deposit", order: view(await refresh(row)) };
  }

  async function get(m: Extract<CashoutMessage, { action: "get" }>): Promise<CashoutResponse> {
    return { action: "get", order: view(await refresh(await ownedOrder(m.owner, m.orderId))) };
  }

  async function list(m: Extract<CashoutMessage, { action: "list" }>): Promise<CashoutResponse> {
    const rows = await store.listByOwner(m.owner, LIST_LIMIT);
    // Bring the few unfinished ones up to date; the rest can't change.
    let budget = 3;
    const fresh = await Promise.all(rows.map((r) => (!isTerminal(r.status) && budget-- > 0 ? refresh(r) : r)));
    return { action: "list", orders: fresh.map(view) };
  }

  function allows(owner: string): boolean {
    return !config.allowedOwners || config.allowedOwners.has(owner.toLowerCase());
  }

  /**
   * Sessions already verified here, so a wallet following an order isn't
   * re-verified every few seconds (for a Google account that check is a network
   * call). The key is the whole claim and is only ever stored after a real
   * check, so a hit means exactly this owner, time and signature were proven.
   * Whether the session has run out is decided on every request, before this.
   */
  const knownSessions = new Set<string>();

  async function verify(owner: string, bytes: Uint8Array, signature: string): Promise<boolean> {
    try {
      return await verifyOwner(owner, bytes, signature);
    } catch (e) {
      log(`[cashout] signature check errored: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  async function sessionIsValid(owner: string, issuedAt: number, signature: string): Promise<boolean> {
    const key = `${owner}:${issuedAt}:${signature}`;
    if (knownSessions.has(key)) return true;
    if (!(await verify(owner, canonicalCashoutSessionBytes(config.network, owner, issuedAt), signature))) return false;
    if (knownSessions.size >= MAX_KNOWN_SESSIONS) {
      // A Set keeps insertion order: drop the oldest.
      for (const oldest of knownSessions) {
        knownSessions.delete(oldest);
        break;
      }
    }
    knownSessions.add(key);
    return true;
  }

  async function handle(body: unknown): Promise<CashoutResponse> {
    const parsed = SignedCashoutSchema.safeParse(body);
    if (!parsed.success) throw new CashoutError("bad_request", "That request isn't valid.", 400);
    const request = parsed.data;
    const m = request.message;
    if (Math.abs(now() - m.timestamp) > maxSkew) {
      throw new CashoutError("unauthorized", "That request is too old. Check your device's clock and try again.", 401);
    }
    let ok: boolean;
    if ("session" in request) {
      const { issuedAt, signature } = request.session;
      // Run out, or dated in the future (a clock set ahead can't buy a longer session).
      if (now() - issuedAt > sessionMs || issuedAt - now() > maxSkew) {
        throw new CashoutError("unauthorized", "Confirm it's you again to carry on.", 401);
      }
      ok = await sessionIsValid(m.owner, issuedAt, signature);
    } else {
      ok = await verify(m.owner, canonicalCashoutBytes(m), request.signature);
    }
    if (!ok) throw new CashoutError("unauthorized", "We couldn't confirm this request came from your wallet. Sign in again and retry.", 401);
    if (!allows(m.owner)) throw new CashoutError("unavailable", "Cash-out isn't available for this wallet yet.", 503);

    switch (m.action) {
      case "verify-bank":
        return verifyBank(m);
      case "create":
        return create(m);
      case "deposit":
        return deposit(m);
      case "get":
        return get(m);
      case "list":
        return list(m);
    }
  }

  async function webhook(rawBody: string, signatureHeader: string | null | undefined): Promise<number> {
    if (!config.webhookSecret) return 503;
    if (!verifyLinqSignature(rawBody, signatureHeader, config.webhookSecret)) return 401;
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return 400;
    }
    const parsed = LinqWebhookEventSchema.safeParse(json);
    if (!parsed.success) return 400;
    const ev = parsed.data;
    const row = await store.getByLinqId(ev.orderId);
    // Not one of ours (or not saved yet): acknowledge so Linq doesn't count a failure.
    if (!row) return 200;

    let status: CashoutStatus | undefined;
    if (ev.event === "order.completed") status = "paid";
    else if (ev.event === "order.processing") status = "processing";
    else if (ev.event === "order.failed") status = normalizeLinqStatus(ev.status ?? "") === "expired" ? "expired" : "failed";

    const patch: CashoutOrderPatch = { status, linqStatus: ev.status ?? ev.event, refreshedAtMs: now() };
    if (status === "paid") {
      const decimals = config.coins[row.coin]?.decimals ?? 6;
      if (ev.amountStableCoin !== undefined && ev.amountStableCoin > 0) patch.settledStable = toBase(ev.amountStableCoin, decimals);
      if (ev.amountNGN !== undefined && ev.amountNGN > 0) patch.settledNgn = ev.amountNGN.toFixed(2);
    }
    await apply(row, patch);
    log(`[cashout] webhook ${ev.event} for ${row.id}`);
    return 200;
  }

  return { rate, handle, webhook, allows };
}
