"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOraclePrices, getOracleState, getOracleTrades, listMarkets, toUsd, type OracleSummary } from "@/lib/predict";
import { CoinIcon } from "./market-select";
import { PredictChart } from "./predict-chart";

/**
 * Predict feed — real DeepBook Predict BTC oracle markets (binary up/down vs a
 * strike at expiry). Swipe up for the next market. Live spot + price history
 * from the public Predict server; real on-chain mint/redeem trades "pop" up.
 */
export function PredictFeed() {
  const markets = useQuery({ queryKey: ["predict-markets"], queryFn: () => listMarkets(8), refetchInterval: 30000 });

  if (markets.isLoading) return <p className="mt-10 text-center text-sm text-ink-faint">Loading BTC markets…</p>;
  if (markets.isError) return <p className="mt-10 text-center text-sm text-ink-soft">Couldn&apos;t reach the Predict server.</p>;
  const list = markets.data ?? [];
  if (!list.length) return <p className="mt-10 text-center text-sm text-ink-faint">No active markets right now.</p>;

  return (
    <div className="mt-4 h-[74vh] snap-y snap-mandatory overflow-y-auto rounded-3xl border border-[color:var(--glass-border)]">
      {list.map((o) => (
        <PredictCard key={o.oracle_id} oracle={o} />
      ))}
    </div>
  );
}

type Pop = { id: number; dir: "up" | "down"; x: number };

function PredictCard({ oracle }: { oracle: OracleSummary }) {
  const id = oracle.oracle_id;
  const state = useQuery({ queryKey: ["oracle-state", id], queryFn: () => getOracleState(id), refetchInterval: 8000 });
  const prices = useQuery({ queryKey: ["oracle-prices", id], queryFn: () => getOraclePrices(id, 120), refetchInterval: 20000 });
  const trades = useQuery({ queryKey: ["oracle-trades", id], queryFn: () => getOracleTrades(id, 40), refetchInterval: 4000 });

  const spot = state.data?.latest_price ? toUsd(state.data.latest_price.spot) : 0;
  const strike = toUsd(oracle.min_strike);
  const inMoney = spot >= strike;

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

  // expiry countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, oracle.expiry - now);
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);

  return (
    <section className="relative flex h-[74vh] snap-start flex-col bg-gradient-to-b from-surface to-surface-muted p-5">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pops.map((p) => (
          <span key={p.id} className="pop absolute bottom-36 text-base font-semibold" style={{ left: `${p.x}%`, color: p.dir === "up" ? "var(--accent)" : "var(--danger)" }}>
            {p.dir === "up" ? "▲" : "▼"}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CoinIcon symbol="BTC" size={44} />
          <div>
            <p className="text-lg font-semibold">BTC above ${strike.toLocaleString()}</p>
            <p className="text-xs text-ink-soft">expires in {mm}:{String(ss).padStart(2, "0")}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-medium tabular-nums">{spot > 0 ? `$${spot.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</p>
          <p className={`text-sm font-medium ${inMoney ? "text-accent" : "text-danger"}`}>{inMoney ? "▲ above" : "▼ below"} strike</p>
        </div>
      </div>

      <div className="my-4 flex-1">
        {prices.isLoading ? (
          <div className="grid h-full place-items-center text-sm text-ink-faint">Loading prices…</div>
        ) : (
          <PredictChart prices={prices.data ?? []} strike={strike} height={240} />
        )}
      </div>

      <p className="text-center text-sm text-ink-soft">Will BTC be above ${strike.toLocaleString()} at expiry?</p>
      <div className="mt-3 flex items-center justify-center gap-8">
        <PredictButton dir="down" onPress={() => spawn("down", 38)} />
        <PredictButton dir="up" onPress={() => spawn("up", 58)} />
      </div>
      <p className="mt-3 text-center text-[11px] text-ink-faint">real on-chain trades pop live · swipe up for the next market</p>
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
