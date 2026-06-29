"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  BTC: "#f7931a",
  ETH: "#627eea",
  SOL: "#9945ff",
};

/** Transparent marks that need a white badge + contain (vs full circular logos). */
const BADGE_IMAGES: Record<string, string> = { SUI: "/sui.png" };
/** Full circular logos rendered edge-to-edge. */
const FULL_IMAGES: Record<string, string> = { DEEP: "/deep.webp", WAL: "/wal.png" };

function logoFor(symbol: string): { src: string; badge?: boolean } | null {
  if (BADGE_IMAGES[symbol]) return { src: BADGE_IMAGES[symbol]!, badge: true };
  if (/usdc/i.test(symbol)) return { src: "/usdc.png" };
  if (/usdt/i.test(symbol)) return { src: "/usdt.png" };
  if (/btc/i.test(symbol)) return { src: "/btc.png" };
  if (FULL_IMAGES[symbol]) return { src: FULL_IMAGES[symbol]! };
  return null;
}

export function CoinIcon({ symbol, size = 22 }: { symbol: string; size?: number }) {
  const logo = logoFor(symbol);
  const bg = COIN_COLORS[symbol] ?? "#9aa0ac";

  // Transparent mark (Sui droplet) → white badge + object-contain.
  if (logo?.badge) {
    return (
      <span
        className="inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-2 ring-surface"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} alt={symbol} className="h-full w-full object-contain" style={{ padding: Math.round(size * 0.14) }} />
      </span>
    );
  }

  // Full circular logo (DEEP / USDC / WAL) → edge-to-edge.
  if (logo) {
    return (
      <span className="inline-block shrink-0 overflow-hidden rounded-full ring-2 ring-surface" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} alt={symbol} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className="inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-medium text-white ring-2 ring-surface"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
    >
      {symbol.slice(0, 1)}
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
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cur = PAIRS.find((p) => p.key === value) ?? PAIRS[0]!;

  const toggle = () => {
    setRect(btnRef.current?.getBoundingClientRect() ?? null);
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="flex items-center gap-2.5 rounded-full border border-[color:var(--glass-border)] bg-surface-glass px-3 py-2 shadow-[var(--shadow-glass)] backdrop-blur-xl"
      >
        <PairIcons base={cur.base} quote={cur.quote} />
        <span className="font-semibold">
          {cur.base} <span className="text-ink-faint">/</span> {cur.quote}
        </span>
        <span className="text-ink-soft">▾</span>
      </button>

      {/* Portal to body so the menu escapes the glass cards' stacking contexts. */}
      {open && rect
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
              <div
                className="fixed z-[101] max-h-[60vh] w-64 overflow-y-auto rounded-2xl border border-[color:var(--glass-border)] bg-surface shadow-[var(--shadow-glass-lg)]"
                style={{ top: rect.bottom + 8, left: rect.left }}
              >
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
            </>,
            document.body,
          )
        : null}
    </>
  );
}
