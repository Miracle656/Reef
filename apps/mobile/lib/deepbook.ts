import { testnetPools } from "@mysten/deepbook-v3";
import { INDEXER_URL } from "./config";

/** The demo creator coin pool (testnet) — mirrors apps/web/lib/deepbook.ts. */
export const SULTAN_POOL_ID = "0xa642193580f83b979fda6e3bcb765cfa15bfaeba3227f059bed124631a1e29f8";

export const POOLS = {
  ...testnetPools,
  SULTAN_DEEP: { address: SULTAN_POOL_ID, baseCoin: "SULTAN", quoteCoin: "DEEP" },
};

export interface Pair {
  key: string;
  base: string;
  quote: string;
  address: string;
}

/** Tradeable pairs for the selector (SULTAN first, then the DeepBook presets). */
export const PAIRS: Pair[] = Object.entries(POOLS)
  .map(([key, p]) => ({
    key,
    base: (p as { baseCoin: string }).baseCoin,
    quote: (p as { quoteCoin: string }).quoteCoin,
    address: (p as { address: string }).address,
  }))
  .sort((a, b) => (a.key === "SULTAN_DEEP" ? -1 : b.key === "SULTAN_DEEP" ? 1 : a.key.localeCompare(b.key)));

export interface BookLevel {
  price: number;
  size: number;
}
export interface OrderBook {
  mid: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

/**
 * DeepBook reads are served by the indexer (Node), NOT computed on-device:
 * @mysten/sui's effect parsing crashes under Metro/Hermes (circular init). The
 * indexer does the `devInspect` and returns plain JSON.
 */
export async function fetchOrderBook(poolKey: string): Promise<OrderBook> {
  const r = await fetch(`${INDEXER_URL}/deepbook/orderbook/${poolKey}`);
  if (!r.ok) throw new Error(`order book ${r.status}`);
  return (await r.json()) as OrderBook;
}

export async function fetchMid(poolKey: string): Promise<number> {
  return (await fetchOrderBook(poolKey)).mid;
}
