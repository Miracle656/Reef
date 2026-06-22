"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deepbook } from "@umbra/core";
import { PAIRS, useDeepBook } from "@/lib/deepbook";
import { CoinIcon } from "./market-select";

/**
 * Mobile-style predict feed: a vertical snap-scroll of markets (swipe up for
 * the next). Each card shows the price, UP/DOWN predict buttons, and live
 * "pops" — trades floating up like hearts on a livestream, then fading.
 */
export function PredictFeed() {
  return (
    <div className="mt-4 h-[72vh] snap-y snap-mandatory overflow-y-auto rounded-3xl border border-[color:var(--glass-border)]">
      {PAIRS.map((p) => (
        <PredictCard key={p.key} pairKey={p.key} base={p.base} quote={p.quote} />
      ))}
    </div>
  );
}

type Pop = { id: number; dir: "up" | "down"; x: number };

function PredictCard({ pairKey, base, quote }: { pairKey: string; base: string; quote: string }) {
  const db = useDeepBook();
  const mid = useQuery({
    queryKey: ["predict-mid", pairKey],
    queryFn: () => deepbook.getMidPrice(db, pairKey),
    refetchInterval: 5000,
  });

  const [pops, setPops] = useState<Pop[]>([]);
  const idRef = useRef(0);

  const spawn = useCallback((dir: "up" | "down", x = 30 + Math.random() * 40) => {
    const id = idRef.current++;
    setPops((p) => [...p, { id, dir, x }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.id !== id)), 2200);
  }, []);

  // simulated live trades popping on the venue
  useEffect(() => {
    const loop = () => {
      spawn(Math.random() > 0.5 ? "up" : "down");
      timer = setTimeout(loop, 600 + Math.random() * 900);
    };
    let timer = setTimeout(loop, 400);
    return () => clearTimeout(timer);
  }, [spawn]);

  const price = mid.data ?? 0;

  return (
    <section className="relative flex h-[72vh] snap-start flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-surface to-surface-muted px-6 text-center">
      {/* pops */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pops.map((p) => (
          <span
            key={p.id}
            className="pop absolute bottom-28 text-base font-semibold"
            style={{ left: `${p.x}%`, color: p.dir === "up" ? "var(--accent)" : "var(--danger)" }}
          >
            {p.dir === "up" ? "▲" : "▼"}
          </span>
        ))}
      </div>

      <CoinIcon symbol={base} size={56} />
      <h2 className="mt-3 text-3xl font-semibold">
        {base} <span className="text-ink-faint">/ {quote}</span>
      </h2>
      <p className="mt-2 text-2xl tabular-nums">
        {price > 0 ? (price < 1 ? price.toPrecision(4) : price.toLocaleString(undefined, { maximumFractionDigits: 4 })) : "—"}{" "}
        <span className="text-base text-ink-soft">{quote}</span>
      </p>
      <p className="mt-1 text-xs text-ink-faint">Will it go up or down?</p>

      <div className="mt-8 flex items-center gap-6">
        <PredictButton dir="down" onPress={() => spawn("down", 38)} />
        <PredictButton dir="up" onPress={() => spawn("up", 58)} />
      </div>

      <p className="absolute bottom-5 text-[11px] text-ink-faint">swipe up for the next market</p>
    </section>
  );
}

function PredictButton({ dir, onPress }: { dir: "up" | "down"; onPress: () => void }) {
  const up = dir === "up";
  return (
    <button
      type="button"
      onClick={onPress}
      className={`lift grid h-20 w-20 place-items-center rounded-full text-2xl font-bold text-white shadow-[var(--shadow-glass)] ${
        up ? "bg-accent" : "bg-danger"
      }`}
      aria-label={up ? "Predict up" : "Predict down"}
    >
      {up ? "▲" : "▼"}
    </button>
  );
}
