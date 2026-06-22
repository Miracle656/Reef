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
import type { Transaction } from "@mysten/sui/transactions";

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
  return db.midPrice(poolKey);
}

export interface OrderBook {
  mid: number;
  bids: Level2Range;
  asks: Level2Range;
}

/** Fetch mid price + level-2 bids/asks for a pool. */
export async function getOrderBook(db: DeepBookClient, poolKey: string): Promise<OrderBook> {
  const mid = await db.midPrice(poolKey).catch(() => 0);
  const hi = mid > 0 ? mid * 4 : 1_000_000_000;
  const [bids, asks] = await Promise.all([
    db.getLevel2Range(poolKey, 0, mid > 0 ? mid : hi, true),
    db.getLevel2Range(poolKey, mid > 0 ? mid : 0, hi, false),
  ]);
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
