"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RightSidebar } from "@/components/right-sidebar";
import { Spinner } from "@/components/ui";
import { PredictChart } from "@/components/predict-chart";
import { toast } from "@/components/toaster";
import { useSocialAccount } from "@/lib/account";
import {
  useBet,
  useDusdcBalance,
  useFundDusdc,
  useMintRange,
  usePreviewTrade,
  useRangePositions,
  useRangePreview,
  useRedeem,
  useRedeemRange,
  type TradePreview,
} from "@/lib/use-predict";
import {
  findManagerByOwner,
  getCachedManagerId,
  getManagerPositions,
  getOraclePrices,
  getOracleState,
  toUsd,
  type Position,
  type RangePosition,
} from "@/lib/predict";

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
const usd2 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const card = "rounded-[20px] border border-[color:var(--glass-border)] bg-surface-glass";

export default function MarketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ strike?: string }> }) {
  const { id } = use(params);
  const { strike: strikeParam } = use(searchParams);
  const account = useSocialAccount();
  const bet = useBet();
  const preview = usePreviewTrade();
  const redeem = useRedeem();
  const dusdcBalance = useDusdcBalance();
  const fund = useFundDusdc();
  const mintRange = useMintRange();
  const rangePreview = useRangePreview();
  const redeemRange = useRedeemRange();
  const readRangePositions = useRangePositions();

  const state = useQuery({ queryKey: ["oracle-state", id], queryFn: () => getOracleState(id), refetchInterval: 8000 });
  const prices = useQuery({ queryKey: ["oracle-prices", id], queryFn: () => getOraclePrices(id, 150), refetchInterval: 20000 });
  const balance = useQuery({ queryKey: ["dusdc-balance", account?.address], queryFn: () => dusdcBalance(), enabled: !!account, refetchInterval: 15000 });

  // Resolve the manager id (cache → server) so we can show open positions here.
  const managerId = useQuery({
    queryKey: ["predict-manager", account?.address],
    queryFn: async () => (account ? getCachedManagerId(account.address) ?? (await findManagerByOwner(account.address)) : null),
    enabled: !!account,
  });
  const positions = useQuery({
    queryKey: ["manager-positions", managerId.data],
    queryFn: () => getManagerPositions(managerId.data as string),
    enabled: !!managerId.data,
    refetchInterval: 12000,
  });
  const rangePositions = useQuery({
    queryKey: ["manager-range-positions", managerId.data],
    queryFn: () => readRangePositions(managerId.data as string),
    enabled: !!managerId.data,
    refetchInterval: 15000,
  });

  const oracle = state.data?.oracle;
  const spot = state.data?.latest_price ? toUsd(state.data.latest_price.spot) : 0;
  const fwd = state.data?.latest_price ? toUsd(state.data.latest_price.forward || state.data.latest_price.spot) : 0;

  // Tick grid (raw 1e9 → USD). Strikes must align to min_strike + k·tick.
  const tick = oracle && oracle.tick_size > 0 ? oracle.tick_size / 1e9 : 1000;
  const minStrike = oracle ? oracle.min_strike / 1e9 : 0;
  const snap = useCallback(
    (usd: number) => {
      const k = Math.max(0, Math.round((usd - minStrike) / tick));
      return Math.round((minStrike + k * tick) * 100) / 100;
    },
    [minStrike, tick],
  );

  const [strike, setStrike] = useState(strikeParam ? Number(strikeParam) / 1e9 : 0);
  useEffect(() => {
    if (strike === 0 && fwd > 0) setStrike(snap(Math.round(fwd / 1000) * 1000));
  }, [fwd, strike, snap]);

  const [mode, setMode] = useState<"binary" | "range">("binary");
  const [side, setSide] = useState<"up" | "down">("up");
  const [sizeUsd, setSizeUsd] = useState("5");
  const size = Math.max(0, Number(sizeUsd) || 0);

  // range band edges (snapped to tick grid); seeded around the binary strike.
  const [lower, setLower] = useState(0);
  const [higher, setHigher] = useState(0);
  useEffect(() => {
    if (lower === 0 && strike > 0) setLower(snap(strike - tick * 2));
    if (higher === 0 && strike > 0) setHigher(snap(strike + tick * 2));
  }, [strike, lower, higher, snap, tick]);

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
  const closed = left <= 0;

  const upProb = strike > 0 ? impliedUpProb(fwd, strike, left) : 0.5;
  const yes = Math.round(upProb * 100);

  // ── live on-chain price preview (debounced devInspect) ─────────────────────
  const [quote, setQuote] = useState<TradePreview | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [notQuotable, setNotQuotable] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rangeValid = lower > 0 && higher > lower;
  useEffect(() => {
    const ready = mode === "binary" ? strike > 0 : rangeValid;
    if (!oracle || size <= 0 || closed || !ready) {
      setQuote(null);
      setNotQuotable(false);
      return;
    }
    setQuoting(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const q =
          mode === "binary"
            ? await preview({ oracleId: oracle.oracle_id, expiry: oracle.expiry, strikeUsd: strike, isUp: side === "up", maxPayoutUsd: size })
            : await rangePreview({ oracleId: oracle.oracle_id, expiry: oracle.expiry, lowerUsd: lower, higherUsd: higher, maxPayoutUsd: size });
        setQuote(q);
        setNotQuotable(q === null);
      } catch {
        setQuote(null);
        setNotQuotable(true);
      } finally {
        setQuoting(false);
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [oracle, mode, strike, lower, higher, rangeValid, size, side, closed, preview, rangePreview]);

  const [funding, setFunding] = useState(false);
  async function getFunds() {
    if (!account) return toast("Sign in first");
    setFunding(true);
    try {
      const r = await fund();
      toast(r.skipped ? "Already funded ✓" : `Funded ${r.amountUsd ? usd0(r.amountUsd) : ""} dUSDC ✓`);
      setTimeout(() => balance.refetch(), 2500);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Funding unavailable");
    } finally {
      setFunding(false);
    }
  }

  const [busy, setBusy] = useState(false);
  async function placeBet() {
    if (!account) return toast("Sign in to predict");
    if (!oracle || size <= 0 || closed) return;
    if (mode === "range" && !rangeValid) return toast("Higher strike must be above the lower strike");
    if ((balance.data ?? 0) < (quote?.costUsd ?? 0)) return toast("Not enough dUSDC — fund your account first");
    setBusy(true);
    try {
      if (mode === "binary") {
        await bet({ side, oracleId: oracle.oracle_id, expiry: oracle.expiry, strikeUsd: strike, maxPayoutUsd: size });
        toast(`Bet placed ✓ — ${side === "up" ? "YES" : "NO"} on BTC ${usd0(strike)}`);
        positions.refetch();
      } else {
        await mintRange({ oracleId: oracle.oracle_id, expiry: oracle.expiry, lowerUsd: lower, higherUsd: higher, maxPayoutUsd: size });
        toast(`Band placed ✓ — BTC ${usd0(lower)}–${usd0(higher)}`);
        rangePositions.refetch();
      }
      balance.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Bet failed");
    } finally {
      setBusy(false);
    }
  }

  const oraclePositions = useMemo(
    () => (positions.data ?? []).filter((p) => p.oracle_id === id && p.open_quantity > 0),
    [positions.data, id],
  );
  const oracleRangePositions = useMemo(
    () => (rangePositions.data ?? []).filter((p) => p.oracleId === id && p.openQuantity > 0),
    [rangePositions.data, id],
  );

  const day = oracle ? new Date(oracle.expiry).toLocaleDateString(undefined, { weekday: "short" }) : "";

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
            <div className={`mt-[18px] ${card} p-5`}>
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

            {/* ── trade ticket ─────────────────────────────────────────── */}
            <div className={`mt-4 ${card} p-5`}>
              {/* mode: binary above/below a strike, or a price band (range) */}
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-[14px] border border-[color:var(--glass-border)] p-1">
                {(["binary", "range"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-[11px] py-2 text-[13px] font-bold capitalize transition-colors ${mode === m ? "bg-ink text-on-ink" : "text-ink-soft"}`}
                  >
                    {m === "binary" ? "Above / below" : "Price band"}
                  </button>
                ))}
              </div>

              {mode === "binary" ? (
                <>
                  {/* side toggle */}
                  <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[color:var(--surface)] p-1">
                    <button
                      onClick={() => setSide("up")}
                      className={`rounded-[11px] py-2.5 text-[14px] font-bold transition-colors ${side === "up" ? "bg-aqua text-[#04302f]" : "text-ink-soft"}`}
                    >
                      YES · above
                    </button>
                    <button
                      onClick={() => setSide("down")}
                      className={`rounded-[11px] py-2.5 text-[14px] font-bold transition-colors ${side === "down" ? "bg-ink text-on-ink" : "text-ink-soft"}`}
                    >
                      NO · below
                    </button>
                  </div>

                  {/* strike (snapped to tick grid) */}
                  <label className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-ink-faint">Strike</label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Stepper onClick={() => setStrike((s) => snap(s - tick))} label="−" />
                    <input
                      type="number"
                      value={strike || ""}
                      step={tick}
                      onChange={(e) => setStrike(Number(e.target.value) || 0)}
                      onBlur={() => setStrike((s) => snap(s))}
                      className="min-w-0 flex-1 rounded-[12px] border border-[color:var(--glass-border)] bg-[color:var(--surface)] px-3 py-2.5 text-center text-[18px] font-bold tabular-nums outline-none focus:border-accent"
                    />
                    <Stepper onClick={() => setStrike((s) => snap(s + tick))} label="+" />
                  </div>
                  <p className="mt-1 font-mono text-[10.5px] text-ink-faint">
                    tick {usd0(tick)} · min {usd0(minStrike)} · pays $1 if BTC settles {side === "up" ? "above" : "below"} strike
                  </p>
                </>
              ) : (
                <>
                  {/* range band: pays $1·qty if settlement ∈ (lower, higher] */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono text-[11px] uppercase tracking-wide text-ink-faint">Lower</label>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Stepper onClick={() => setLower((s) => snap(s - tick))} label="−" />
                        <input
                          type="number"
                          value={lower || ""}
                          step={tick}
                          onChange={(e) => setLower(Number(e.target.value) || 0)}
                          onBlur={() => setLower((s) => snap(s))}
                          className="min-w-0 flex-1 rounded-[12px] border border-[color:var(--glass-border)] bg-[color:var(--surface)] px-2 py-2.5 text-center text-[16px] font-bold tabular-nums outline-none focus:border-accent"
                        />
                        <Stepper onClick={() => setLower((s) => snap(s + tick))} label="+" />
                      </div>
                    </div>
                    <div>
                      <label className="block font-mono text-[11px] uppercase tracking-wide text-ink-faint">Higher</label>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Stepper onClick={() => setHigher((s) => snap(s - tick))} label="−" />
                        <input
                          type="number"
                          value={higher || ""}
                          step={tick}
                          onChange={(e) => setHigher(Number(e.target.value) || 0)}
                          onBlur={() => setHigher((s) => snap(s))}
                          className="min-w-0 flex-1 rounded-[12px] border border-[color:var(--glass-border)] bg-[color:var(--surface)] px-2 py-2.5 text-center text-[16px] font-bold tabular-nums outline-none focus:border-accent"
                        />
                        <Stepper onClick={() => setHigher((s) => snap(s + tick))} label="+" />
                      </div>
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-[10.5px] text-ink-faint">
                    pays $1 if BTC settles between {usd0(lower)} and {usd0(higher)}
                  </p>
                </>
              )}

              {/* size */}
              <label className="mt-4 block font-mono text-[11px] uppercase tracking-wide text-ink-faint">Max payout (size)</label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[18px] font-bold text-ink-faint">$</span>
                <input
                  type="number"
                  value={sizeUsd}
                  min={1}
                  onChange={(e) => setSizeUsd(e.target.value)}
                  className="min-w-0 flex-1 rounded-[12px] border border-[color:var(--glass-border)] bg-[color:var(--surface)] px-3 py-2.5 text-[18px] font-bold tabular-nums outline-none focus:border-accent"
                />
                <div className="flex gap-1">
                  {[5, 10, 25].map((v) => (
                    <button key={v} onClick={() => setSizeUsd(String(v))} className="rounded-[9px] border border-[color:var(--glass-border)] px-2.5 py-1 font-mono text-[11px] text-ink-soft hover:border-accent">
                      ${v}
                    </button>
                  ))}
                </div>
              </div>

              {/* quote */}
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-[14px] bg-[color:var(--surface)] p-3 text-center">
                <Quote label="Price" value={quote ? quote.price.toFixed(2) : quoting ? "…" : "—"} />
                <Quote label="You pay" value={quote ? usd2(quote.costUsd) : quoting ? "…" : "—"} />
                <Quote label="Max payout" value={quote ? usd2(quote.payoutUsd) : quoting ? "…" : "—"} />
              </div>
              {notQuotable && !quoting ? (
                <p className="mt-2 text-center font-mono text-[11px] text-danger">Strike not quotable — move it closer to spot.</p>
              ) : null}

              {/* place */}
              {(() => {
                const yesStyle = mode === "binary" && side === "up";
                const label = closed
                  ? "Market closed"
                  : mode === "binary"
                    ? `Bet ${side === "up" ? "YES" : "NO"}${quote ? ` · ${usd2(quote.costUsd)}` : ""}`
                    : `Place band${quote ? ` · ${usd2(quote.costUsd)}` : ""}`;
                return (
                  <button
                    onClick={placeBet}
                    disabled={busy || closed || quoting || !quote}
                    className={`mt-4 flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-bold disabled:opacity-50 ${yesStyle ? "bg-aqua text-[#04302f]" : "bg-ink text-on-ink"}`}
                  >
                    {busy ? <Spinner className={yesStyle ? "border-[#04302f]" : "border-on-ink"} /> : null}
                    {label}
                  </button>
                );
              })()}

              <div className="mt-3 flex items-center justify-between font-mono text-[11px]">
                <span className="text-[#0a8a5b]">⛽ gas sponsored</span>
                <span className="text-ink-faint">
                  dUSDC: {account ? (balance.isLoading ? "…" : usd2(balance.data ?? 0)) : "—"}
                </span>
              </div>
              {account && (balance.data ?? 0) <= 0 ? (
                <button
                  onClick={getFunds}
                  disabled={funding}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-[color:var(--glass-border)] px-3 py-2.5 font-mono text-[11.5px] text-ink-soft hover:border-accent disabled:opacity-50"
                >
                  {funding ? <Spinner /> : null}
                  Get test dUSDC to trade →
                </button>
              ) : null}
            </div>

            {/* ── your open positions on this market ───────────────────── */}
            {oraclePositions.length > 0 || oracleRangePositions.length > 0 ? (
              <div className={`mt-4 ${card} p-5`}>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">Your positions</div>
                <div className="space-y-2.5">
                  {oraclePositions.map((p, i) => (
                    <PositionRow key={`b-${p.strike}-${p.is_up}-${i}`} p={p} redeem={redeem} onDone={() => positions.refetch()} />
                  ))}
                  {oracleRangePositions.map((p, i) => (
                    <RangePositionRow key={`r-${p.lowerStrike}-${p.higherStrike}-${i}`} p={p} redeem={redeemRange} onDone={() => rangePositions.refetch()} />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

function PositionRow({
  p,
  redeem,
  onDone,
}: {
  p: Position;
  redeem: ReturnType<typeof useRedeem>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const settled = p.status === "won" || p.status === "lost";
  async function sell() {
    setBusy(true);
    try {
      await redeem({
        oracleId: p.oracle_id,
        expiry: p.expiry,
        strike: p.strike,
        isUp: p.is_up,
        quantity: BigInt(Math.round(p.open_quantity)),
      });
      toast(settled ? "Claimed ✓" : "Position sold ✓");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Redeem failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[color:var(--surface)] px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[14px] font-bold">
          {p.is_up ? "YES" : "NO"} · {usd0(p.strike / 1e9)}
        </div>
        <div className="font-mono text-[10.5px] text-ink-faint">
          {usd2(p.open_quantity / 1e6)} max · entry {(p.average_entry_price / 1e9).toFixed(2)} · {p.status}
        </div>
      </div>
      <button
        onClick={sell}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-[11px] border border-[color:var(--glass-border)] px-3.5 py-2 text-[13px] font-bold text-ink hover:border-accent disabled:opacity-50"
      >
        {busy ? <Spinner /> : null}
        {settled ? "Claim" : "Sell"}
      </button>
    </div>
  );
}

function RangePositionRow({
  p,
  redeem,
  onDone,
}: {
  p: RangePosition;
  redeem: ReturnType<typeof useRedeemRange>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function sell() {
    setBusy(true);
    try {
      await redeem({
        oracleId: p.oracleId,
        expiry: p.expiry,
        lowerStrike: p.lowerStrike,
        higherStrike: p.higherStrike,
        quantity: BigInt(Math.round(p.openQuantity)),
      });
      toast("Band redeemed ✓");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Redeem failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] bg-[color:var(--surface)] px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[14px] font-bold">
          BAND · {usd0(p.lowerStrike / 1e9)}–{usd0(p.higherStrike / 1e9)}
        </div>
        <div className="font-mono text-[10.5px] text-ink-faint">{usd2(p.openQuantity / 1e6)} max payout</div>
      </div>
      <button
        onClick={sell}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-[11px] border border-[color:var(--glass-border)] px-3.5 py-2 text-[13px] font-bold text-ink hover:border-accent disabled:opacity-50"
      >
        {busy ? <Spinner /> : null}
        Redeem
      </button>
    </div>
  );
}

function Quote({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5 text-[16px] font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Stepper({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[12px] border border-[color:var(--glass-border)] text-[20px] font-bold text-ink-soft hover:border-accent"
    >
      {label}
    </button>
  );
}

function Crosshair() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </svg>
  );
}
