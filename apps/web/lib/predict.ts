// DeepBook Predict — public testnet server client (mirrors deepmarket).
// Markets are on-chain BTC oracles: binary up/down positions settling above/
// below a strike at expiry. Prices/strikes are 1e9-scaled; dUSDC qty is 1e6.

export const PREDICT_SERVER = "https://predict-server.testnet.mystenlabs.com";
export const PREDICT_OBJECT_ID = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";

const PRICE_SCALE = 1e9;
const QTY_SCALE = 1e6;

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
