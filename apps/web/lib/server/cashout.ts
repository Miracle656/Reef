/**
 * SERVER-ONLY (imported by route handlers under app/api). Builds the cash-out
 * service from environment variables. The rules live in `@umbra/core/server`;
 * this file only supplies the real pieces: Linq (or its stand-in), Postgres,
 * and wallet-signature verification on the wallet's network.
 *
 * Environment (all server-side, never NEXT_PUBLIC):
 *   LINQ_API_KEY                  live mode: Linq's API key (real money, mainnet only)
 *   LINQ_WEBHOOK_SECRET           verifies Linq's webhooks; without it they are refused
 *   LINQ_BASE_URL                 optional override of Linq's base URL
 *   CASHOUT_MODE=mock             rehearsal: no Linq, no bank, test money
 *   CASHOUT_MOCK_DEPOSIT_ADDRESS  where rehearsal deposits are sent (an address you control)
 *   DATABASE_URL                  Postgres (Neon) for the order table
 *   CASHOUT_MIN_USD / CASHOUT_MAX_USD   per-order limits (default 1 / 500)
 * plus NEXT_PUBLIC_WALLET_NETWORK, which says which network the wallet is on.
 */
import { neon } from "@neondatabase/serverless";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { cashout, createSuiClient, wallet } from "@umbra/core";
import {
  createCashoutService,
  createLinqClient,
  createMemoryCashoutStore,
  createMockLinqClient,
  createSqlCashoutStore,
  type CashoutCoinInfo,
  type CashoutService,
  type CashoutStore,
  type LinqClient,
} from "@umbra/core/server";

export interface CashoutInfo {
  mode: "live" | "mock";
  network: wallet.WalletNetwork;
  /** coins that can be cashed out here */
  coins: cashout.CashoutCoin[];
  minCents: string;
  maxCents: string;
}

export type CashoutRuntime = { ok: true; service: CashoutService; info: CashoutInfo } | { ok: false; reason: string };

function centsFromEnv(value: string | undefined, fallback: bigint): bigint {
  if (!value) return fallback;
  try {
    return cashout.toHundredths(value.trim());
  } catch {
    return fallback;
  }
}

async function build(): Promise<CashoutRuntime> {
  const network = wallet.parseWalletNetwork(process.env.NEXT_PUBLIC_WALLET_NETWORK);
  if (!network) return { ok: false, reason: "The wallet isn't switched on." };

  const mock = process.env.CASHOUT_MODE?.trim().toLowerCase() === "mock";
  const apiKey = process.env.LINQ_API_KEY?.trim();
  if (!mock && !apiKey) return { ok: false, reason: "Cash-out isn't set up yet." };
  // Linq pays out real naira for real dollars and only knows mainnet.
  if (!mock && network !== "mainnet") return { ok: false, reason: "Cash-out needs the wallet on mainnet." };

  const walletCfg = wallet.walletConfig(network);
  const coins: Partial<Record<cashout.CashoutCoin, CashoutCoinInfo>> = {};
  for (const c of walletCfg.coins) {
    const key = cashout.cashoutCoinFor(c.symbol);
    if (key) coins[key] = { type: c.type, decimals: c.decimals };
  }

  let store: CashoutStore;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    const sql = neon(databaseUrl);
    store = createSqlCashoutStore((text, params) => sql.query(text, params) as Promise<Record<string, unknown>[]>);
  } else if (mock && process.env.NODE_ENV !== "production") {
    // Local rehearsal only: orders live in this process and vanish on restart.
    // Next builds each API route as its own bundle with its own copy of this
    // module, so the list is kept on globalThis for the routes to share.
    const g = globalThis as { __reefCashoutMemoryStore?: CashoutStore };
    store = g.__reefCashoutMemoryStore ??= createMemoryCashoutStore();
  } else {
    return { ok: false, reason: "Cash-out has nowhere to keep its records (DATABASE_URL)." };
  }
  await store.init();

  let linq: LinqClient;
  if (mock) {
    const depositAddress = process.env.CASHOUT_MOCK_DEPOSIT_ADDRESS?.trim();
    if (!depositAddress) return { ok: false, reason: "Rehearsal mode needs CASHOUT_MOCK_DEPOSIT_ADDRESS." };
    linq = createMockLinqClient({
      depositAddress: wallet.parseRecipient(depositAddress),
      coinTypes: Object.fromEntries(Object.entries(coins).map(([k, v]) => [k, v.type])),
      lookup: async (linqOrderId) => {
        const row = await store.getByLinqId(linqOrderId);
        if (!row) return null;
        const decimals = coins[row.coin]?.decimals ?? 6;
        return {
          createdAtMs: row.createdAtMs,
          depositAtMs: row.depositAtMs,
          amountStableCoin: Number(wallet.formatUnits(row.amountStable, decimals)),
          amountNGN: Number(row.amountNgn),
        };
      },
    });
  } else {
    linq = createLinqClient({ apiKey: apiKey!, baseUrl: process.env.LINQ_BASE_URL?.trim() || undefined });
  }

  // zkLogin signatures are checked against the chain they were made for, so
  // this must be the WALLET network's client, not the social app's.
  const client = createSuiClient(walletCfg);
  const minCents = centsFromEnv(process.env.CASHOUT_MIN_USD, 100n);
  const maxCents = centsFromEnv(process.env.CASHOUT_MAX_USD, 50_000n);

  const service = createCashoutService({
    store,
    linq,
    config: { network, coins, minCents, maxCents, webhookSecret: process.env.LINQ_WEBHOOK_SECRET?.trim() || undefined },
    log: (message) => console.log(message),
    verifyOwner: async (owner, bytes, signature) => {
      const publicKey = await verifyPersonalMessageSignature(bytes, signature, { client, address: owner });
      return normalizeSuiAddress(publicKey.toSuiAddress()) === normalizeSuiAddress(owner);
    },
  });

  return {
    ok: true,
    service,
    info: { mode: mock ? "mock" : "live", network, coins: Object.keys(coins) as cashout.CashoutCoin[], minCents: minCents.toString(), maxCents: maxCents.toString() },
  };
}

let runtime: Promise<CashoutRuntime> | null = null;

/** The cash-out service for this server instance, built once. A failed build is retried on the next request. */
export function getCashout(): Promise<CashoutRuntime> {
  runtime ??= build().catch((e) => {
    runtime = null;
    console.error("[cashout] setup failed:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "Cash-out is unavailable right now." } as CashoutRuntime;
  });
  return runtime;
}
