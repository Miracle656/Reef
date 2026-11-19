/**
 * SERVER-ONLY. A stand-in for Linq, for rehearsing the whole cash-out flow with
 * test money. Linq has no sandbox and runs on mainnet only, so without this the
 * first end-to-end run would be with real dollars.
 *
 * It behaves like the real API as far as the app can tell: it quotes a rate,
 * "finds" a name for any account, hands out a deposit address, and then walks
 * an order through Linq's status texts once a deposit has been reported. No
 * bank is involved and no naira moves. The deposit address is one WE choose
 * (`depositAddress`), so the test dollars land somewhere we control.
 */
import { centsForNgn, koboForCents, toHundredths, type CashoutCoin } from "./index";
import { LinqError, type LinqClient } from "./linq";

export interface MockLinqOptions {
  /** where test deposits are sent: an address you control on the wallet network */
  depositAddress: string;
  /** Move coin type to quote for each coin (the wallet network's types) */
  coinTypes: Partial<Record<CashoutCoin, string>>;
  /** naira per dollar to quote (default 1500) */
  rate?: number;
  /**
   * What we know about an order we created: when it was made and when a
   * deposit was reported. The mock has no memory of its own.
   */
  lookup: (linqOrderId: string) => Promise<{ createdAtMs: number; depositAtMs: number | null; amountStableCoin: number; amountNGN: number } | null>;
  now?: () => number;
  /** how long a deposited order stays "in the bank queue" before it is "paid" (default 15s) */
  payoutDelayMs?: number;
}

export const MOCK_ORDER_PREFIX = "mock-";

export function createMockLinqClient(opts: MockLinqOptions): LinqClient {
  const now = opts.now ?? Date.now;
  const rate = opts.rate ?? 1500;
  const payoutDelay = opts.payoutDelayMs ?? 15_000;

  return {
    async getRate() {
      return { rate, currency: "NGN", coin: "USDSUI" };
    },

    async verifyBank({ bankCode, accountNumber }) {
      // An account ending 0000 "doesn't exist", so the not-found path can be rehearsed too.
      if (accountNumber.endsWith("0000")) throw new LinqError(400, "could not resolve account");
      return { accountName: "TEST ACCOUNT (NO REAL PAYOUT)", bankName: `Test bank ${bankCode}`, accountNumber, bankCode };
    },

    async createOfframp(input) {
      const coinType = opts.coinTypes[input.coin];
      if (!coinType) throw new LinqError(400, `unsupported coin ${input.coin}`);
      // Linq's arithmetic: naira-first rounds the dollars UP to the cent.
      const cents =
        input.amountNGN !== undefined
          ? centsForNgn(toHundredths(input.amountNGN.toFixed(2)), rate)
          : toHundredths(input.amountStableCoin!.toFixed(2));
      const kobo = input.amountNGN !== undefined ? toHundredths(input.amountNGN.toFixed(2)) : koboForCents(cents, rate);
      return {
        id: `${MOCK_ORDER_PREFIX}${input.idempotencyKey}`,
        walletAddress: opts.depositAddress,
        coinType,
        coin: input.coin,
        chain: "sui",
        amountStableCoin: Number(cents) / 100,
        amountNGN: Number(kobo) / 100,
        rate,
        status: "initiated",
      };
    },

    async getStatus(orderId) {
      const o = await opts.lookup(orderId);
      if (!o) throw new LinqError(404, "order not found");
      const t = now();
      const amounts = { amountStableCoin: o.amountStableCoin, amountNGN: o.amountNGN };
      if (o.depositAtMs === null) {
        return { id: orderId, status: t - o.createdAtMs > 10 * 60_000 ? "timeout: no deposit received" : "processing: wallet worker on it..", ...amounts };
      }
      return { id: orderId, status: t - o.depositAtMs < payoutDelay ? "processing: in bank queue" : "Settled in treasury", ...amounts };
    },
  };
}
