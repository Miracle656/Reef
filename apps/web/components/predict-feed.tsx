"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ORACLE_ASSETS, fetchCandles } from "@/lib/oracle";
import { CandleChart } from "./candle-chart";
import { CoinIcon } from "./market-select";

/**
 * Predict feed: binary up/down on oracle prices (BTC/ETH/SOL) — not the
 * DeepBook token pairs. Real candles + spot from GMX's public keeper. Swipe up
 * for the next market; trades "pop" up the screen like livestream hearts.
 */
export function PredictFeed() {
  return (
    <div className="mt-4 h-[74vh] snap-y snap-mandatory overflow-y-auto rounded-3xl border border-[color:var(--glass-border)]">
      {ORACLE_ASSETS.map((a) => (
        <PredictCard key={a} asset={a} />
      ))}
    </div>
  );
}

type Pop = { id: number; dir: "up" | "down"; x: number };

function PredictCard({ asset }: { asset: string }) {
  const candles = useQuery({
    queryKey: ["candles", asset],
    queryFn: () => fetchCandles(asset, "1m", 60),
    refetchInterval: 15000,
  });
  const data = candles.data ?? [];
  const last = data[data.length - 1];
  const first = data[0];
  const price = last?.close ?? 0;
  const change = first && last && first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const up = change >= 0;

  const [pops, setPops] = useState<Pop[]>([]);
  const idRef = useRef(0);
  const spawn = useCallback((dir: "up" | "down", x = 25 + Math.random() * 50) => {
    const id = idRef.current++;
    setPops((p) => [...p, { id, dir, x }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.id !== id)), 2200);
  }, []);

  useEffect(() => {
    const loop = () => {
      spawn(Math.random() > 0.5 ? "up" : "down");
      t = setTimeout(loop, 600 + Math.random() * 900);
    };
    let t = setTimeout(loop, 400);
    return () => clearTimeout(t);
  }, [spawn]);

  const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 4 : 2 })}`;

  return (
    <section className="relative flex h-[74vh] snap-start flex-col bg-gradient-to-b from-surface to-surface-muted p-5">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pops.map((p) => (
          <span
            key={p.id}
            className="pop absolute bottom-36 text-base font-semibold"
            style={{ left: `${p.x}%`, color: p.dir === "up" ? "var(--accent)" : "var(--danger)" }}
          >
            {p.dir === "up" ? "▲" : "▼"}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CoinIcon symbol={asset} size={44} />
          <div>
            <p className="text-lg font-semibold">
              {asset} <span className="text-ink-faint">/ USD</span>
            </p>
            <p className="text-xs text-ink-soft">oracle · GMX keeper</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-medium tabular-nums">{price > 0 ? fmtUsd(price) : "—"}</p>
          <p className={`text-sm font-medium ${up ? "text-accent" : "text-danger"}`}>
            {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="my-4 flex-1">
        {candles.isLoading ? (
          <div className="grid h-full place-items-center text-sm text-ink-faint">Loading {asset} candles…</div>
        ) : data.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-ink-faint">Oracle feed unavailable.</div>
        ) : (
          <CandleChart candles={data} height={240} />
        )}
      </div>

      <p className="text-center text-sm text-ink-soft">Will {asset} be higher in the next minute?</p>
      <div className="mt-3 flex items-center justify-center gap-8">
        <PredictButton dir="down" onPress={() => spawn("down", 38)} />
        <PredictButton dir="up" onPress={() => spawn("up", 58)} />
      </div>
      <p className="mt-3 text-center text-[11px] text-ink-faint">swipe up for the next market</p>
    </section>
  );
}

function PredictButton({ dir, onPress }: { dir: "up" | "down"; onPress: () => void }) {
  const up = dir === "up";
  return (
    <button
      type="button"
      onClick={onPress}
      className={`lift grid h-20 w-20 place-items-center rounded-full text-2xl font-bold text-white shadow-[var(--shadow-glass)] ${up ? "bg-accent" : "bg-danger"}`}
      aria-label={up ? "Predict up" : "Predict down"}
    >
      {up ? "▲" : "▼"}
    </button>
  );
}
