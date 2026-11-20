/**
 * SERVER-ONLY. Client for Linq's B2B offramp API (dollars on Sui -> naira in a
 * Nigerian bank account). It holds the API key, so it is exported through
 * `@umbra/core/server` and must never reach an app bundle.
 *
 * Linq runs on mainnet only and has no sandbox: every order made through this
 * client is real.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { CashoutCoin } from "./index";

export const DEFAULT_LINQ_BASE_URL = "https://confidential-brianna-uselinq-52e2b233.koyeb.app";

export class LinqError extends Error {
  constructor(
    /** HTTP status from Linq, or 0 when the request never got an answer */
    readonly status: number,
    message: string,
    /** set to false when trying again can't help (Linq answered, but not in a shape we understand) */
    private readonly retryable?: boolean,
  ) {
    super(message);
    this.name = "LinqError";
  }
  /** Worth another try: the request didn't land, Linq is busy, or it rate-limited us. */
  get transient(): boolean {
    return this.retryable ?? (this.status === 0 || this.status === 429 || this.status >= 500);
  }
}

// ---- response shapes (validated: this is someone else's API moving money) -----

const RateSchema = z.object({ rate: z.number().positive(), currency: z.string().optional(), coin: z.string().optional() });

const BankAccountSchema = z.object({
  accountName: z.string().min(1),
  // Linq sends this empty for some banks (OPay, seen 2026-11-20). The name on
  // the account is what matters; the caller knows which bank it asked about.
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  bankCode: z.string().optional(),
});

const OfframpOrderSchema = z.object({
  id: z.string().min(1),
  walletAddress: z.string().min(1),
  coinType: z.string(),
  coin: z.string(),
  /** absent on older deployments, where every order was on Sui */
  chain: z.string().optional(),
  amountStableCoin: z.number().positive(),
  amountNGN: z.number().positive(),
  rate: z.number().positive(),
  status: z.string(),
});

const OrderStatusSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  amountStableCoin: z.number().optional(),
  amountNGN: z.number().optional(),
});

export type LinqRate = z.infer<typeof RateSchema>;
export type LinqBankAccount = z.infer<typeof BankAccountSchema>;
export type LinqOfframpOrder = z.infer<typeof OfframpOrderSchema>;
export type LinqOrderStatus = z.infer<typeof OrderStatusSchema>;

export interface LinqOfframpRequest {
  /** exactly one of the two amounts */
  amountNGN?: number;
  amountStableCoin?: number;
  coin: CashoutCoin;
  /** 10-digit account number */
  bankAccount: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  /** where Linq returns the dollars if the bank payout fails */
  refundAddress: string;
  customerRef: string;
  /** same key twice = the original order, not a second one */
  idempotencyKey: string;
}

export interface LinqClient {
  /** Indicative naira-per-dollar rate (public endpoint, no key needed). */
  getRate(): Promise<LinqRate>;
  /** Resolve an account number to the name the bank holds for it. */
  verifyBank(input: { bankCode: string; accountNumber: string }): Promise<LinqBankAccount>;
  /** Create an offramp order; the answer carries the one-time deposit address. */
  createOfframp(input: LinqOfframpRequest): Promise<LinqOfframpOrder>;
  getStatus(orderId: string): Promise<LinqOrderStatus>;
}

export interface LinqConfig {
  apiKey: string;
  baseUrl?: string;
  /** per-request timeout (default 15s) */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createLinqClient(config: LinqConfig): LinqClient {
  const base = (config.baseUrl ?? DEFAULT_LINQ_BASE_URL).replace(/\/+$/, "");
  const doFetch = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 15_000;

  async function once<T>(schema: z.ZodType<T>, path: string, init: { method: "GET" | "POST"; body?: unknown; auth: boolean }): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method: init.method,
        headers: {
          ...(init.auth ? { "X-API-Key": config.apiKey } : {}),
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new LinqError(0, `Linq didn't answer: ${e instanceof Error ? e.message : String(e)}`);
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON: handled below */
    }
    if (!res.ok) {
      const message = (json as { message?: unknown } | null)?.message;
      throw new LinqError(res.status, typeof message === "string" && message ? message : `Linq answered HTTP ${res.status}`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new LinqError(502, `Linq sent an answer we don't understand (${path.split("?")[0]})`, false);
    return parsed.data;
  }

  /** Retry transient failures. Safe for every call here: the reads change
   *  nothing, and order creation carries an idempotency key. */
  async function call<T>(schema: z.ZodType<T>, path: string, init: { method: "GET" | "POST"; body?: unknown; auth: boolean }, attempts = 3): Promise<T> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await once(schema, path, init);
      } catch (e) {
        last = e;
        if (!(e instanceof LinqError) || !e.transient || i === attempts - 1) throw e;
        await sleep(400 * (i + 1));
      }
    }
    throw last;
  }

  return {
    getRate: () => call(RateSchema, "/b2b/rate", { method: "GET", auth: false }),

    verifyBank: ({ bankCode, accountNumber }) =>
      call(BankAccountSchema, "/b2b/verifybank", { method: "POST", auth: true, body: { bankCode, accountNumber } }),

    createOfframp: async (input) => {
      const hasNgn = input.amountNGN !== undefined;
      const hasStable = input.amountStableCoin !== undefined;
      if (hasNgn === hasStable) throw new Error("createOfframp needs exactly one of amountNGN / amountStableCoin");
      return call(OfframpOrderSchema, "/b2b/offramp", {
        method: "POST",
        auth: true,
        body: {
          ...input,
          chain: "sui",
          currency: "NGN",
          // Users hold their own keys, so what arrives is never guaranteed to
          // match the request. With manualDeposit Linq pays out on what really
          // arrived; without it a short deposit would still be paid in full,
          // out of our balance. Never make this optional.
          manualDeposit: true,
        },
      });
    },

    getStatus: (orderId) => call(OrderStatusSchema, `/b2b/status?id=${encodeURIComponent(orderId)}`, { method: "GET", auth: true }),
  };
}

// ---- webhooks ---------------------------------------------------------------

/**
 * True iff `signatureHeader` (Linq's `X-Linq-Signature`) is the HMAC-SHA256 of
 * the RAW request body under our webhook secret. Verify before parsing the body.
 */
export function verifyLinqSignature(rawBody: string, signatureHeader: string | null | undefined, webhookSecret: string): boolean {
  if (!signatureHeader || !webhookSecret) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex"));
  const given = Buffer.from(signatureHeader.trim());
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const LinqWebhookEventSchema = z.object({
  event: z.string(),
  orderId: z.string().min(1),
  status: z.string().optional(),
  amountStableCoin: z.number().optional(),
  amountNGN: z.number().optional(),
});
export type LinqWebhookEvent = z.infer<typeof LinqWebhookEventSchema>;
