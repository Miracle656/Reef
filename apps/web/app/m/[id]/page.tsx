"use client";

import { use, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RightSidebar } from "@/components/right-sidebar";
import { Spinner } from "@/components/ui";
import { PredictChart } from "@/components/predict-chart";
import { toast } from "@/components/toaster";
import { useSocialAccount } from "@/lib/account";
import { usePredict } from "@/lib/use-predict";
import { getOraclePrices, getOracleState, toUsd } from "@/lib/predict";

const MODEL_VOL = 0.6;
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function impliedUpProb(forward: number, strike: number, ms: number): number {
  if (forward <= 0 || strike <= 0 || ms <= 0) return 0.5;
  const T = ms / (365.25 * 24 * 3600 * 1000);
  const sigT = MODEL_VOL * Math.sqrt(Math.max(T, 1e-9));
  const d2 = (Math.log(forward / strike) - 0.5 * MODEL_VOL * MODEL_VOL * T) / sigT;
  return Math.min(0.98, Math.max(0.02, normCdf(d2)));
}
const usd0 = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function MarketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ strike?: string }> }) {
  const { id } = use(params);
  const { strike: strikeParam } = use(searchParams);
  const account = useSocialAccount();
  const mint = usePredict();

  const state = useQuery({ queryKey: ["oracle-state", id], queryFn: () => getOracleState(id), refetchInterval: 8000 });
  const prices = useQuery({ queryKey: ["oracle-prices", id], queryFn: () => getOraclePrices(id, 150), refetchInterval: 20000 });

  const oracle = state.data?.oracle;
  const spot = state.data?.latest_price ? toUsd(state.data.latest_price.spot) : 0;
  const fwd = state.data?.latest_price ? toUsd(state.data.latest_price.forward || state.data.latest_price.spot) : 0;

  // strike from URL (1e9-scaled) else nearest $1k to forward.
  const [strike, setStrike] = useState(strikeParam ? Number(strikeParam) / 1e9 : 0);
  useEffect(() => {
    if (strike === 0 && fwd > 0) setStrike(Math.round(fwd / 1000) * 1000);
  }, [fwd, strike]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = oracle ? Math.max(0, oracle.expiry - now) : 0;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  const hh = Math.floor(mm / 60);
  const countdown = hh > 0 ? `${hh}h ${mm % 60}m` : `${mm}:${String(ss).padStart(2, "0")}`;

  const upProb = strike > 0 ? impliedUpProb(fwd, strike, left) : 0.5;
  const yes = Math.round(upProb * 100);

  const [side, setSide] = useState<"up" | "down">("up");
  const [busy, setBusy] = useState(false);

  async function bet(s: "up" | "down") {
    if (!account) return toast("Sign in to predict");
    if (!oracle || strike <= 0 || left <= 0) return;
    setSide(s);
    setBusy(true);
    try {
      await mint(s, oracle.oracle_id, oracle.expiry, strike);
      toast(`Bet placed ✓ — ${s === "up" ? "YES" : "NO"} on BTC ${usd0(strike)}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Bet failed");
    } finally {
      setBusy(false);
    }
  }

  const day = oracle ? new Date(oracle.expiry).toLocaleDateString(undefined, { weekday: "short" }) : "";
  const closed = left <= 0;

  return (
    <AppShell flush title="Market" subtitle="BTC binary · DeepBook Predict" back="/trade" right={<RightSidebar />}>
      <div className="px-6 py-5">
        {state.isLoading ? (
          <div className="grid place-items-center py-20"><Spinner /></div>
        ) : !oracle ? (
          <p className="py-20 text-center text-ink-soft">Market not found.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-coral">
              <Crosshair /> Predict · DeepBook · BTC binary
            </div>
            <h1 className="text-[30px] font-black leading-[1.1] tracking-tight">
              BTC &gt; {strike > 0 ? usd0(strike) : "…"} by {day}?
            </h1>

            {/* YES% + chart */}
            <div className="mt-[18px] rounded-[20px] border border-[color:var(--glass-border)] bg-surface-glass p-5">
              <div className="flex items-end justify-between">
                <div className="flex items-end gap-2">
                  <span className="text-[52px] font-black leading-[0.85] text-[#0a8a5b]">{yes}</span>
                  <span className="mb-1.5 font-mono text-[14px] text-ink-faint">% YES</span>
                </div>
                <span className="font-mono text-[12px] text-ink-faint">
                  BTC {spot > 0 ? usd0(spot) : "—"} · {closed ? "closed" : `closes ${countdown}`}
                </span>
              </div>
              <div className="mt-4">
                {prices.isLoading ? (
                  <div className="grid h-[200px] place-items-center"><Spinner /></div>
                ) : (
                  <PredictChart prices={prices.data ?? []} strike={strike || undefined} height={200} />
                )}
              </div>
            </div>

            {/* buy yes / no */}
            <div className="mt-4 grid grid-cols-2 gap-3.5">
              <div className="rounded-[20px] border border-[color:rgba(24,194,194,.4)] bg-surface-glass p-[18px]">
                <div className="mb-2 font-mono text-[11px] text-ink-faint">BUY YES</div>
                <div className="text-[26px] font-black text-[#0a8a5b]">{upProb.toFixed(2)}</div>
                <button
                  onClick={() => bet("up")}
                  disabled={busy || closed}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-[13px] bg-aqua py-3 text-[15px] font-bold text-[#04302f] disabled:opacity-50"
                >
                  {busy && side === "up" ? <Spinner className="border-[#04302f]" /> : null}
                  {closed ? "Closed" : "Bet YES"}
                </button>
              </div>
              <div className="rounded-[20px] border border-[color:var(--glass-border)] bg-surface-glass p-[18px]">
                <div className="mb-2 font-mono text-[11px] text-ink-faint">BUY NO</div>
                <div className="text-[26px] font-black text-danger">{(1 - upProb).toFixed(2)}</div>
                <button
                  onClick={() => bet("down")}
                  disabled={busy || closed}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-[13px] bg-ink py-3 text-[15px] font-bold text-on-ink disabled:opacity-50"
                >
                  {busy && side === "down" ? <Spinner className="border-on-ink" /> : null}
                  {closed ? "Closed" : "Bet NO"}
                </button>
              </div>
            </div>

            <p className="py-3.5 text-center font-mono text-[11px] text-[#0a8a5b]">
              ⛽ gas sponsored · settled by the orderbook
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Crosshair() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </svg>
  );
}
