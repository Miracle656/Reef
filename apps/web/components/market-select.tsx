"use client";

import { useState } from "react";
import { PAIRS } from "@/lib/deepbook";

/** Placeholder coin colors until real icon images are provided. */
const COIN_COLORS: Record<string, string> = {
  SUI: "#4da2ff",
  DEEP: "#1f6feb",
  DBUSDC: "#2775ca",
  DBUSDT: "#26a17b",
  WAL: "#0ea5a4",
  DBTC: "#f7931a",
  SULTAN: "#7c3aed",
};

/** Swap-in point for real icons later: map symbol -> image URL. */
const COIN_IMAGES: Record<string, string> = {};

export function CoinIcon({ symbol, size = 22 }: { symbol: string; size?: number }) {
  const img = COIN_IMAGES[symbol];
  const bg = COIN_COLORS[symbol] ?? "#9aa0ac";
  return (
    <span
      className="inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-medium text-white ring-2 ring-surface"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={symbol} className="h-full w-full object-cover" />
      ) : (
        symbol.slice(0, 1)
      )}
    </span>
  );
}

export function PairIcons({ base, quote, size = 22 }: { base: string; quote: string; size?: number }) {
  return (
    <span className="inline-flex items-center">
      <CoinIcon symbol={base} size={size} />
      <span style={{ marginLeft: -size * 0.35 }}>
        <CoinIcon symbol={quote} size={size} />
      </span>
    </span>
  );
}

export function MarketSelect({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = PAIRS.find((p) => p.key === value) ?? PAIRS[0]!;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-full border border-[color:var(--glass-border)] bg-surface-glass px-3 py-2 shadow-[var(--shadow-glass)] backdrop-blur-xl"
      >
        <PairIcons base={cur.base} quote={cur.quote} />
        <span className="font-semibold">
          {cur.base} <span className="text-ink-faint">/</span> {cur.quote}
        </span>
        <span className="text-ink-soft">▾</span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-[color:var(--glass-border)] bg-surface shadow-[var(--shadow-glass-lg)]">
            {PAIRS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onChange(p.key);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted ${
                  p.key === value ? "bg-surface-muted" : ""
                }`}
              >
                <PairIcons base={p.base} quote={p.quote} size={20} />
                <span className="font-medium">
                  {p.base} <span className="text-ink-faint">/</span> {p.quote}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
