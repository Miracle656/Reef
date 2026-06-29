"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOraclePrices, getOracleState, getOracleTrades, listMarkets, toUsd, type OracleSummary } from "@/lib/predict";
import { usePredict } from "@/lib/use-predict";
import { CoinIcon } from "./market-select";
import { PredictChart } from "./predict-chart";

/**
 * Predict feed — "Hot Take". Real DeepBook Predict BTC oracle markets rendered
 * as a full-screen, swipeable feed on mobile and an expanded grid on desktop.
 *
 * Each oracle is a binary above/below market on a vol surface. We ladder the
 * strike per card (so every card is a different bet) and show genuine implied
 * probabilities from the live forward price, strike and time-to-expiry.
 */

const UP = "#16c784"; // green
const DOWN = "#f6465d"; // red

// Annualized vol used for the testnet odds model. Swap for the oracle's
// SVI-implied vol (state.latest_svi) for surface-accurate pricing later.
const MODEL_VOL = 0.6;

// Per-card strike offsets (USD) around the rounded forward, so consecutive
// cards ask different questions instead of all reading the same strike.
const STRIKE_OFFSETS = [0, -1000, 1000, -2000, 2000, -3000, 3000, 5000];

// ── math ────────────────────────────────────────────────────────────────────

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** P(spot > strike at expiry) under a lognormal forward model. */
function impliedUpProb(forward: number, strike: number, msToExpiry: number): number {
  if (forward <= 0 || strike <= 0 || msToExpiry <= 0) return 0.5;
  const T = msToExpiry / (365.25 * 24 * 3600 * 1000);
  const sigT = MODEL_VOL * Math.sqrt(Math.max(T, 1e-9));
  const d2 = (Math.log(forward / strike) - 0.5 * MODEL_VOL * MODEL_VOL * T) / sigT;
  return Math.min(0.98, Math.max(0.02, normCdf(d2)));
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const usd0 = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// ── icons (inline, lucide-style) ─────────────────────────────────────────────

const ic = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Share = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" {...ic}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
);
const Bars = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" {...ic}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
);
const Clock = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" {...ic}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
);

// ── feed ──────────────────────────────────────────────────────────────────

export function PredictFeed() {
  const markets = useQuery({ queryKey: ["predict-markets"], queryFn: () => listMarkets(12), refetchInterval: 60000 });

  const list = useMemo(
    () => [...(markets.data ?? [])].sort((a, b) => a.expiry - b.expiry),
    [markets.data],
  );

  if (markets.isLoading) return <p className="mt-12 text-center text-sm text-ink-faint">Loading BTC markets…</p>;
  if (markets.isError) return <p className="mt-12 text-center text-sm text-ink-soft">Couldn&apos;t reach the Predict server.</p>;
  if (list.length === 0) return <p className="mt-12 text-center text-sm text-ink-faint">No active markets right now.</p>;

  return (
    <div className="mt-4 h-[76vh] snap-y snap-mandatory overflow-y-auto rounded-3xl md:h-auto md:snap-none md:overflow-visible md:rounded-none md:grid md:grid-cols-2 md:gap-5">
      {list.map((o, i) => (
        <PredictCard key={o.oracle_id} oracle={o} index={i} />
      ))}
    </div>
  );
}

type Pop = { id: number; dir: "up" | "down"; x: number };

function PredictCard({ oracle, index }: { oracle: OracleSummary; index: number }) {
  const id = oracle.oracle_id;
  const state = useQuery({ queryKey: ["oracle-state", id], queryFn: () => getOracleState(id), refetchInterval: 8000 });
  const prices = useQuery({ queryKey: ["oracle-prices", id], queryFn: () => getOraclePrices(id, 120), refetchInterval: 20000 });
  const trades = useQuery({ queryKey: ["oracle-trades", id], queryFn: () => getOracleTrades(id, 40), refetchInterval: 5000 });

  const spot = state.data?.latest_price ? toUsd(state.data.latest_price.spot) : 0;
  const fwd = state.data?.latest_price ? toUsd(state.data.latest_price.forward || state.data.latest_price.spot) : 0;

  // Lock a laddered strike the first time a price arrives (nearest $1k to the
  // forward, offset per card) so the card is stable and each asks a real bet.
  const [strike, setStrike] = useState(0);
  useEffect(() => {
    if (strike === 0 && fwd > 0) {
      const base = Math.round(fwd / 1000) * 1000;
      setStrike(Math.max(1000, base + (STRIKE_OFFSETS[index % STRIKE_OFFSETS.length] ?? 0)));
    }
  }, [fwd, strike, index]);

  // live countdown
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, oracle.expiry - now);
  const hh = Math.floor(left / 3600_000);
  const mm = Math.floor((left % 3600_000) / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  const countdown = hh > 0 ? `${hh}h ${mm}m` : `${mm}:${String(ss).padStart(2, "0")}`;

  const upProb = strike > 0 ? impliedUpProb(fwd, strike, left) : 0.5;
  const upFav = upProb >= 0.5;

  // selection + confirmation
  const mint = usePredict();
  const [picked, setPicked] = useState<"up" | "down" | null>(null);
  const [locked, setLocked] = useState<"up" | "down" | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  // trade "pops"
  const [pops, setPops] = useState<Pop[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const idRef = useRef(0);
  const spawn = useCallback((dir: "up" | "down", x = 20 + Math.random() * 60) => {
    const pid = idRef.current++;
    setPops((p) => [...p, { id: pid, dir, x }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.id !== pid)), 2200);
  }, []);

  // pop REAL on-chain trades as they arrive (skip the initial backlog)
  useEffect(() => {
    const t = trades.data;
    if (!t) return;
    if (seen.current.size === 0) {
      t.forEach((x) => seen.current.add(x.digest));
      return;
    }
    t.filter((x) => !seen.current.has(x.digest)).forEach((x) => {
      seen.current.add(x.digest);
      spawn(x.isUp ? "up" : "down");
    });
  }, [trades.data, spawn]);

  const confirm = async () => {
    if (status === "pending" || strike === 0) return;
    const side = picked ?? (upFav ? "up" : "down");
    setPicked(side);
    setStatus("pending");
    setErr(null);
    try {
      await mint(side, oracle.oracle_id, oracle.expiry, strike);
      setLocked(side);
      spawn(side, side === "up" ? 60 : 38);
      spawn(side, side === "up" ? 70 : 28);
      setStatus("idle");
      setTimeout(() => setLocked(null), 6000);
    } catch (e) {
      setStatus("error");
      const msg = String((e as Error)?.message ?? e);
      setErr(
        /sign in/i.test(msg)
          ? "Sign in to place a prediction."
          : /dUSDC|insufficient|no valid coins|balance|gas/i.test(msg)
            ? "You need test dUSDC on this address to predict."
            : "Couldn't place prediction — try again.",
      );
    }
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = `Hot Take: Will BTC be above ${usd0(strike)} at expiry?`;
    try {
      if (navigator.share) await navigator.share({ title: "Hot Take", text, url });
      else await navigator.clipboard?.writeText(`${text} ${url}`);
    } catch {
      /* user dismissed */
    }
  };

  const expDate = new Date(oracle.expiry).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <section
      className={`relative flex snap-start flex-col overflow-hidden p-5 text-white min-h-[76vh] md:min-h-[33rem] md:rounded-3xl ${
        upFav ? "bg-gradient-to-b from-[#0e2a20] via-[#0b1a16] to-[#06100c]" : "bg-gradient-to-b from-[#2a0e13] via-[#1a0c0f] to-[#100709]"
      }`}
    >
      {/* watermark + glow */}
      <div className="pointer-events-none absolute -right-20 top-6 opacity-[0.06]">
        <CoinIcon symbol="BTC" size={340} />
      </div>
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 80% at 80% 0%, ${upFav ? "rgba(22,199,132,0.18)" : "rgba(246,70,93,0.16)"}, transparent 60%)` }} />

      {/* pops */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pops.map((p) => (
          <span key={p.id} className="pop absolute bottom-40 text-xl font-bold" style={{ left: `${p.x}%`, color: p.dir === "up" ? UP : DOWN }}>
            {p.dir === "up" ? "▲" : "▼"}
          </span>
        ))}
      </div>

      {/* top row: pills + share */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm" style={{ color: UP }}>
            Crypto
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-sm">2 options</span>
        </div>
        <button type="button" onClick={share} aria-label="Share" className="lift grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/80 backdrop-blur-sm">
          <Share size={16} />
        </button>
      </div>

      {/* title */}
      <div className="relative mt-5">
        <div className="flex items-center gap-3">
          <CoinIcon symbol="BTC" size={40} />
          <div className="text-3xl font-black tabular-nums">{spot > 0 ? usd0(spot) : "—"}</div>
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${upFav ? "bg-[#16c784]/20" : "bg-[#f6465d]/20"}`} style={{ color: upFav ? UP : DOWN }}>
            {upFav ? "▲" : "▼"} spot
          </span>
        </div>
        <h3 className="mt-3 text-[1.9rem] font-black leading-tight">
          BTC ABOVE {strike > 0 ? usd0(strike) : "…"}
        </h3>
        <p className="mt-1 text-sm text-white/55">BTC · settles {expDate}</p>
      </div>

      {/* chart */}
      <div className="relative my-4 flex-1">
        {prices.isLoading ? (
          <div className="grid h-full min-h-[140px] place-items-center text-sm text-white/40">Loading prices…</div>
        ) : (
          <PredictChart prices={prices.data ?? []} strike={strike || undefined} height={200} />
        )}
      </div>

      {/* option chips */}
      <div className="relative grid grid-cols-2 gap-3">
        <OptionChip label="Up" prob={upProb} color={UP} active={picked === "up"} fav={upFav} onPress={() => setPicked("up")} />
        <OptionChip label="Down" prob={1 - upProb} color={DOWN} active={picked === "down"} fav={!upFav} onPress={() => setPicked("down")} />
      </div>

      {/* stats */}
      <div className="relative mt-3 flex items-center gap-5 text-[13px] text-white/55">
        <span className="inline-flex items-center gap-1.5"><Bars /> {fwd > 0 ? `fwd ${usd0(fwd)}` : "—"}</span>
        <span className="inline-flex items-center gap-1.5"><Clock /> {countdown}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-current" /></span>
          live
        </span>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={confirm}
        disabled={status === "pending" || strike === 0}
        className="lift mt-4 h-14 w-full rounded-2xl text-base font-extrabold uppercase tracking-wide text-white shadow-[0_10px_30px_-8px_rgba(255,90,31,0.6)] disabled:opacity-60"
        style={{ background: "linear-gradient(180deg,#ff7a2f,#f2530f)" }}
      >
        {status === "pending"
          ? "Placing…"
          : locked
            ? `Locked: ${locked === "up" ? "Up" : "Down"} ✓`
            : picked
              ? `Predict ${picked === "up" ? "Up ▲" : "Down ▼"}`
              : "Pick your prediction"}
      </button>
      <p className="relative mt-2 text-center text-[11px] text-white/45">
        {err ? <span className="text-[#ff9a8a]">{err}</span> : locked ? "Position minted on-chain · settles at expiry" : "$1 contract · gasless · swipe up for the next market"}
      </p>
    </section>
  );
}

function OptionChip({ label, prob, color, active, fav, onPress }: { label: string; prob: number; color: string; active: boolean; fav: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`lift relative overflow-hidden rounded-2xl border px-4 py-3 text-left transition-colors ${active ? "border-white/70 bg-white/15" : "border-white/10 bg-black/30"}`}
    >
      {/* prob fill bar */}
      <span className="absolute inset-y-0 left-0 opacity-20" style={{ width: `${prob * 100}%`, background: color }} />
      <span className="relative flex items-center justify-between">
        <span className="text-sm font-bold text-white">{label}</span>
        <span className="text-base font-black tabular-nums" style={{ color }}>{pct(prob)}</span>
      </span>
      {fav ? <span className="relative mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-white/45">favored</span> : <span className="relative mt-0.5 block text-[10px] text-transparent">.</span>}
    </button>
  );
}
