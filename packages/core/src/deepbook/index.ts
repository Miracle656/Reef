/**
 * DeepBook v3 integration (@mysten/deepbook-v3 1.5.1).
 *
 * DeepBook trades existing `Coin<T>` types — it does not mint coins. The flow:
 *   1. publish a creator coin (see packages/creator-coin) -> a Coin<T>
 *   2. register it here in `coins`, then `addCreatePermissionlessPool` (costs
 *      POOL_CREATION_FEE_DEEP, paid by the pool creator)
 *   3. traders use a shared BalanceManager + `addPlaceLimitOrder`
 *
 * The `DeepBookClient` accepts our normal JSON-RPC client
 * (`DeepBookCompatibleClient extends ClientWithCoreApi`) — no gRPC needed.
 */
import {
  DeepBookClient,
  POOL_CREATION_FEE_DEEP,
  type CoinMap,
  type CreatePermissionlessPoolParams,
  type DeepBookCompatibleClient,
  type Level2Range,
  type PlaceLimitOrderParams,
  type PoolMap,
} from "@mysten/deepbook-v3";
import { coinWithBalance, type Transaction } from "@mysten/sui/transactions";

export { POOL_CREATION_FEE_DEEP };
export type { CreatePermissionlessPoolParams, PlaceLimitOrderParams, CoinMap, PoolMap };

export interface DeepBookSetup {
  client: DeepBookCompatibleClient;
  /** sender address */
  address: string;
  /** custom coins (e.g. a creator coin) keyed by symbol, merged with testnet presets */
  coins?: CoinMap;
  /** custom pools keyed by pool key */
  pools?: PoolMap;
  /** named BalanceManagers the sender controls */
  balanceManagers?: Record<string, { address: string; tradeCapId?: string }>;
}

/** Build a DeepBookClient (testnet) for reads + tx building. */
export function createDeepBookClient(s: DeepBookSetup): DeepBookClient {
  return new DeepBookClient({
    client: s.client,
    address: s.address,
    network: "testnet",
    coins: s.coins,
    pools: s.pools,
    balanceManagers: s.balanceManagers,
  });
}

// ---- reads -----------------------------------------------------------------

export async function getMidPrice(db: DeepBookClient, poolKey: string): Promise<number> {
  return db.midPrice(poolKey).catch(() => 0);
}

export interface BookLevel {
  price: number;
  size: number;
}
export interface OrderBook {
  mid: number;
  /** best (highest) first */
  bids: BookLevel[];
  /** best (lowest) first */
  asks: BookLevel[];
}

/**
 * Order book via `get_level2_ticks_from_mid` (N ticks each side of mid) —
 * prices/sizes are human-scaled by the SDK. Mid falls back to best bid/ask
 * when the pool is one-sided (midPrice aborts without both sides).
 */
export async function getOrderBook(db: DeepBookClient, poolKey: string, ticks = 12): Promise<OrderBook> {
  const t = await db.getLevel2TicksFromMid(poolKey, ticks).catch(() => null);
  const zip = (prices: number[] = [], qty: number[] = []): BookLevel[] =>
    prices.map((price, i) => ({ price, size: qty[i] ?? 0 })).filter((l) => l.size > 0);

  const bids = zip(t?.bid_prices, t?.bid_quantities).sort((a, b) => b.price - a.price);
  const asks = zip(t?.ask_prices, t?.ask_quantities).sort((a, b) => a.price - b.price);

  let mid = await db.midPrice(poolKey).catch(() => 0);
  if (!mid) {
    const bb = bids[0]?.price;
    const ba = asks[0]?.price;
    mid = bb && ba ? (bb + ba) / 2 : (bb ?? ba ?? 0);
  }
  return { mid, bids, asks };
}

// ---- tx builders -----------------------------------------------------------

export function addCreatePermissionlessPool(db: DeepBookClient, tx: Transaction, params: CreatePermissionlessPoolParams): void {
  db.deepBook.createPermissionlessPool(params)(tx);
}

export function addCreateBalanceManager(db: DeepBookClient, tx: Transaction): void {
  db.balanceManager.createAndShareBalanceManager()(tx);
}

export function addDepositIntoManager(db: DeepBookClient, tx: Transaction, managerKey: string, coinKey: string, amount: number): void {
  db.balanceManager.depositIntoManager(managerKey, coinKey, amount)(tx);
}

export function addPlaceLimitOrder(db: DeepBookClient, tx: Transaction, params: PlaceLimitOrderParams): void {
  db.deepBook.placeLimitOrder(params)(tx);
}

/**
 * Permissionless pools (e.g. a creator coin / DEEP) can't compute DEEP-denominated
 * fees until a DEEP price point is added from a whitelisted reference pool. Without
 * it, swaps abort in `deep_price::calculate_order_deep_price`. Call once (it aborts
 * with EDataPointRecentlyAdded if added too recently — safe to ignore).
 */
export function addPrimeDeepPrice(db: DeepBookClient, tx: Transaction, targetPoolKey: string, referencePoolKey = "DEEP_SUI"): void {
  db.deepBook.addDeepPricePoint(targetPoolKey, referencePoolKey)(tx);
}

export interface SwapInput {
  poolKey: string;
  /** "quoteToBase" spends quote → receives base (e.g. SUI→DEEP, DEEP→SULTAN). */
  direction: "quoteToBase" | "baseToQuote";
  /** human amount of the INPUT coin (quote for quoteToBase, base for baseToQuote). */
  amount: number;
  /** coin type of the INPUT coin (what's spent). */
  inputType: string;
  /** scalar (base units per 1 human unit) of the input coin, e.g. 1e9 for SUI. */
  inputScalar: number;
  /** DEEP budget for taker fees; 0 for whitelisted pools. Unused DEEP is returned. */
  deepAmount?: number;
  /** slippage floor — minimum OUTPUT amount (human). 0 = accept any. */
  minOut?: number;
}

/**
 * Permissionless DeepBook market swap (no BalanceManager). The input coin is
 * built from the sender's *owned* coins (useGasCoin:false) so it works inside a
 * sponsored transaction — otherwise the SDK splits SUI from the gas coin, which
 * a sponsored tx can't reference ("Cannot use GasCoin as a transaction argument").
 * The three result coins (output, leftover input, leftover DEEP) go to the sender.
 */
export function addSwap(db: DeepBookClient, tx: Transaction, p: SwapInput, sender: string): void {
  const inputCoin = coinWithBalance({
    type: p.inputType,
    balance: BigInt(Math.round(p.amount * p.inputScalar)),
    useGasCoin: false,
  });
  const params = {
    poolKey: p.poolKey,
    amount: p.amount,
    deepAmount: p.deepAmount ?? 0,
    minOut: p.minOut ?? 0,
    ...(p.direction === "quoteToBase" ? { quoteCoin: inputCoin } : { baseCoin: inputCoin }),
  };
  const build = p.direction === "quoteToBase" ? db.deepBook.swapExactQuoteForBase : db.deepBook.swapExactBaseForQuote;
  const out = build(params)(tx);
  tx.transferObjects([out[0], out[1], out[2]], sender);
}
