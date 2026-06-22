// Oracle price feed for Predict markets — GMX's public, unauthenticated
// keeper gives real BTC/ETH/SOL OHLC candles (DeepBook has no cheap OHLC).
// Predict markets are binary up/down positions on these oracle prices.

const BASE = "https://arbitrum-api.gmxinfra.io";

export type Period = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Oracle assets shown in the Predict feed. */
export const ORACLE_ASSETS = ["BTC", "ETH", "SOL"] as const;
export type OracleAsset = (typeof ORACLE_ASSETS)[number];

interface CandlesResponse {
  period: Period;
  candles: [number, number, number, number, number][]; // [t, o, h, l, c]
}

export async function fetchCandles(symbol: string, period: Period, limit: number, signal?: AbortSignal): Promise<Candle[]> {
  const url = `${BASE}/prices/candles?tokenSymbol=${encodeURIComponent(symbol)}&period=${period}&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`GMX candles ${res.status}`);
  const json = (await res.json()) as CandlesResponse;
  return json.candles
    .map(([time, open, high, low, close]) => ({ time, open, high, low, close }))
    .sort((a, b) => a.time - b.time);
}
