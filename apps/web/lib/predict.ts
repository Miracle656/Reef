// DeepBook Predict — public testnet server client (mirrors deepmarket).
// Markets are on-chain BTC oracles: binary up/down positions settling above/
// below a strike at expiry. Prices/strikes are 1e9-scaled; dUSDC qty is 1e6.

import { INDEXER_URL } from "./config";

export const PREDICT_SERVER = "https://predict-server.testnet.mystenlabs.com";
export const PREDICT_OBJECT_ID = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";

// On-chain Predict deployment (Mysten testnet) — used by the mint tx builders.
export const PREDICT_PKG = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
export const DUSDC_TYPE = "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";
export const PLP_TYPE = `${PREDICT_PKG}::plp::PLP`;
export const CLOCK_ID = "0x6";
export const PREDICT_MANAGER_TYPE = `${PREDICT_PKG}::predict_manager::PredictManager`;

export const PRICE_SCALE = 1e9;
export const QTY_SCALE = 1e6;
/** dUSDC base units per $1 max-payout contract (6 decimals). */
export const usdToQty = (usd: number): bigint => BigInt(Math.round(usd * QTY_SCALE));
/** 1e9-scaled strike from a USD price. */
export const usdToStrike = (usd: number): number => Math.round(usd * PRICE_SCALE);

/** raw 1e9-scaled price -> USD */
export const toUsd = (raw: number): number => raw / PRICE_SCALE;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${PREDICT_SERVER}${path}`);
  if (!res.ok) throw new Error(`predict ${res.status} ${path}`);
  return (await res.json()) as T;
}

export type OracleStatus = "inactive" | "active" | "pending" | "settled";

export interface OracleSummary {
  oracle_id: string;
  underlying_asset: string;
  expiry: number;
  min_strike: number;
  tick_size: number;
  status: OracleStatus;
  settlement_price: number | null;
}

export interface PriceUpdate {
  spot: number;
  forward: number;
  checkpoint_timestamp_ms?: number;
  onchain_timestamp?: number;
}

export interface OracleState {
  oracle: OracleSummary;
  latest_price: PriceUpdate | null;
}

export interface PredictTrade {
  side: "mint" | "redeem";
  isUp?: boolean;
  quantity: number;
  strike?: number;
  timestampMs: number;
  digest: string;
}

/** Active BTC oracle markets, soonest expiry first, capped for the feed. */
export async function listMarkets(limit = 8): Promise<OracleSummary[]> {
  const all = await get<OracleSummary[]>(`/predicts/${PREDICT_OBJECT_ID}/oracles`);
  const now = Date.now();
  return all
    .filter((o) => o.status === "active" && o.expiry > now)
    .sort((a, b) => a.expiry - b.expiry)
    .slice(0, limit);
}

export const getOracleState = (id: string) => get<OracleState>(`/oracles/${id}/state`);

export async function getOraclePrices(id: string, limit = 120): Promise<PriceUpdate[]> {
  const rows = await get<PriceUpdate[]>(`/oracles/${id}/prices?limit=${limit}`);
  return [...rows].sort((a, b) => (a.checkpoint_timestamp_ms ?? 0) - (b.checkpoint_timestamp_ms ?? 0));
}

interface RawTrade {
  type: "mint" | "redeem";
  digest: string;
  checkpoint_timestamp_ms: number;
  quantity: number;
  strike?: number;
  is_up?: boolean;
}

export async function getOracleTrades(id: string, limit = 40): Promise<PredictTrade[]> {
  const raw = await get<RawTrade[]>(`/trades/${id}?limit=${limit}`);
  return raw.map((r) => ({
    side: r.type,
    isUp: r.is_up,
    quantity: r.quantity / QTY_SCALE,
    strike: r.strike != null ? r.strike / PRICE_SCALE : undefined,
    timestampMs: r.checkpoint_timestamp_ms,
    digest: r.digest,
  }));
}

// ── PredictManager lookup (each user needs one to hold positions) ────────────

interface ManagerListEntry {
  manager_id: string;
  owner: string;
  [k: string]: unknown;
}

/** Structural shape of a Sui tx objectChange (avoids SDK type-path churn). */
type ObjChange = { type: string; objectType?: string; objectId?: string };

/** First PredictManager owned by `address` (server-indexed). null if none. */
export async function findManagerByOwner(address: string): Promise<string | null> {
  try {
    const all = await get<ManagerListEntry[]>(`/managers?owner=${address}`);
    const lower = address.toLowerCase();
    const m = all.find((x) => x.owner?.toLowerCase() === lower && x.manager_id);
    return m?.manager_id ?? null;
  } catch {
    return null;
  }
}

const mgrKey = (a: string) => `predict.manager.${a.toLowerCase()}`;

export function getCachedManagerId(address: string): string | null {
  try {
    return localStorage.getItem(mgrKey(address));
  } catch {
    return null;
  }
}

export function setCachedManagerId(address: string, id: string): void {
  try {
    localStorage.setItem(mgrKey(address), id);
  } catch {
    /* quota / disabled */
  }
}

/** Pull a freshly-created PredictManager id out of a tx's objectChanges. */
export function extractManagerIdFromChanges(changes: ObjChange[] | null | undefined): string | null {
  if (!changes) return null;
  for (const ch of changes) {
    if (ch.type === "created" && ch.objectType === PREDICT_MANAGER_TYPE && ch.objectId) return ch.objectId;
  }
  return null;
}

// ── Manager portfolio (server-indexed) ───────────────────────────────────────

export interface ManagerSummary {
  manager_id: string;
  owner: string;
  trading_balance: number; // raw 1e6
  open_exposure: number;
  redeemable_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  account_value: number; // raw 1e6
  open_positions: number;
  awaiting_settlement_positions: number;
}

export type PositionStatus = "open" | "won" | "lost" | "awaiting_settlement";

export interface Position {
  oracle_id: string;
  underlying_asset: string;
  expiry: number;
  strike: number; // raw 1e9
  is_up: boolean;
  open_quantity: number; // raw 1e6
  total_cost: number; // raw 1e6
  realized_pnl: number;
  unrealized_pnl: number;
  average_entry_price: number; // raw 1e9 (0..1e9 = ¢)
  mark_price: number; // raw 1e9
  mark_value: number; // raw 1e6
  status: PositionStatus;
  last_activity_at: number;
}

/**
 * An open range (band) position. Range positions are NOT in the server's
 * /positions/summary (binary-only) — they live on-chain in the manager's
 * `range_positions: Table<RangeKey, u64>`, read via getManagerRangePositions.
 * Strikes are raw 1e9; openQuantity is raw 1e6.
 */
export interface RangePosition {
  oracleId: string;
  expiry: number;
  lowerStrike: number; // raw 1e9
  higherStrike: number; // raw 1e9
  openQuantity: number; // raw 1e6
}

/** Account-level rollup for a manager. 404 before the manager is indexed. */
export const getManagerSummary = (managerId: string) => get<ManagerSummary>(`/managers/${managerId}/summary`);

/** Binary positions for a manager (range positions are on-chain only). */
export const getManagerPositions = (managerId: string) => get<Position[]>(`/managers/${managerId}/positions/summary`);

/** raw 1e6 dUSDC base units -> USD */
export const qtyToUsd = (raw: number): number => raw / QTY_SCALE;

export interface DripResult {
  funded: boolean;
  skipped?: string;
  digest?: string;
  amountUsd?: number;
}

/**
 * Ask the indexer's dUSDC faucet to drip testnet collateral to `address`.
 * No-ops server-side if the address already holds enough (idempotent). Throws
 * on faucet-disabled / drip failure.
 */
export async function requestDusdc(address: string): Promise<DripResult> {
  const res = await fetch(`${INDEXER_URL}/faucet/dusdc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? `faucet ${res.status}`);
  }
  return (await res.json()) as DripResult;
}

/**
 * Decode a `get_trade_amounts` devInspect result into per-trade (cost, payout)
 * in raw dUSDC base units. The PTB is [ key::new, get_trade_amounts ], so the
 * two u64 return values live at results[1]. Returns null on abort / bad shape
 * (an abort means the strike is out of the quotable band).
 */
export async function decodeTradeAmounts(
  results: { returnValues?: [number[], string][] }[] | null | undefined,
): Promise<{ cost: bigint; payout: bigint } | null> {
  const { bcs } = await import("@mysten/sui/bcs");
  const ret = results?.[1]?.returnValues;
  const costBytes = ret?.[0]?.[0];
  const payoutBytes = ret?.[1]?.[0];
  if (!costBytes || !payoutBytes) return null;
  try {
    const cost = bcs.u64().parse(new Uint8Array(costBytes));
    const payout = bcs.u64().parse(new Uint8Array(payoutBytes));
    return { cost: BigInt(cost), payout: BigInt(payout) };
  } catch {
    return null;
  }
}
