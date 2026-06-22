"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deepbook } from "@umbra/core";
import { AppNav } from "@/components/app-nav";
import { Button, Card, Spinner } from "@/components/ui";
import { CoinIcon, MarketSelect } from "@/components/market-select";
import { PredictFeed } from "@/components/predict-feed";
import { PriceChart } from "@/components/price-chart";
import { PAIRS, useDeepBook } from "@/lib/deepbook";

export default function TradePage() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"trade" | "predict">("trade");
  useEffect(() => setMounted(true), []);

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-28">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{mode === "trade" ? "Trade" : "Predict"}</h1>
          <div className="flex gap-1 rounded-full bg-surface-muted p-1">
            {(["trade", "predict"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                  mode === m ? "bg-ink text-on-ink" : "text-ink-soft"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {mounted ? mode === "trade" ? <Terminal /> : <PredictFeed /> : null}
      </main>
    </>
  );
}

type Level = { price: number; size: number };
const fmtPrice = (p: number) => (p === 0 ? "—" : p < 1 ? p.toPrecision(4) : p.toLocaleString(undefined, { maximumFractionDigits: 4 }));
const fmtSize = (s: number) => s.toLocaleString(undefined, { maximumFractionDigits: 3 });

function Terminal() {
  const db = useDeepBook();
  const [pairKey, setPairKey] = useState("SUI_DBUSDC");
  const pair = PAIRS.find((p) => p.key === pairKey) ?? PAIRS[0]!;

  const book = useQuery({
    queryKey: ["orderbook", pairKey],
    queryFn: () => deepbook.getOrderBook(db, pairKey),
    refetchInterval: 6000,
  });

  const asks: Level[] = (book.data?.asks ?? []).slice(0, 9);
  const bids: Level[] = (book.data?.bids ?? []).slice(0, 9);
  const maxSize = Math.max(1, ...asks.map((l) => l.size), ...bids.map((l) => l.size));
  const mid = book.data?.mid ?? 0;
  const spread = bids[0] && asks[0] ? asks[0].price - bids[0].price : undefined;

  return (
    <div className="mt-4 space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <MarketSelect value={pairKey} onChange={setPairKey} />
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Mid price</p>
          <p className="text-xl font-medium tabular-nums">
            {fmtPrice(mid)} <span className="text-sm text-ink-soft">{pair.quote}</span>
          </p>
        </div>
      </Card>

      <Card className="p-3">
        <PriceChart poolKey={pairKey} />
      </Card>

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <Card className="p-4">
          <div className="mb-2 flex justify-between text-xs font-medium uppercase tracking-wide text-ink-faint">
            <span>Price ({pair.quote})</span>
            <span>Size ({pair.base})</span>
          </div>
          {book.isLoading ? (
            <div className="grid place-items-center py-10">
              <Spinner />
            </div>
          ) : asks.length === 0 && bids.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">No resting orders on this pool yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="space-y-0.5">
                {[...asks].reverse().map((l, i) => (
                  <Row key={`a${i}`} l={l} side="ask" max={maxSize} />
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-muted px-2 py-1 text-sm">
                <span className="font-medium tabular-nums">{fmtPrice(mid)}</span>
                {spread != null ? <span className="text-xs text-ink-soft">spread {fmtPrice(spread)}</span> : null}
              </div>
              <div className="space-y-0.5">
                {bids.map((l, i) => (
                  <Row key={`b${i}`} l={l} side="bid" max={maxSize} />
                ))}
              </div>
            </div>
          )}
        </Card>

        <TradePanel pair={pair} mid={mid} />
      </div>
    </div>
  );
}

function Row({ l, side, max }: { l: Level; side: "ask" | "bid"; max: number }) {
  const color = side === "ask" ? "var(--danger)" : "var(--accent)";
  return (
    <div className="relative flex items-center justify-between rounded-md px-2 py-1 text-sm tabular-nums">
      <div className="absolute inset-y-0 right-0 rounded-md opacity-15" style={{ width: `${(l.size / max) * 100}%`, backgroundColor: color }} />
      <span className="relative z-10 font-medium" style={{ color }}>
        {fmtPrice(l.price)}
      </span>
      <span className="relative z-10 text-ink-soft">{fmtSize(l.size)}</span>
    </div>
  );
}

function TradePanel({ pair, mid }: { pair: { base: string; quote: string }; mid: number }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit">("limit");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (mid > 0 && !price) setPrice(String(Number(mid.toPrecision(4))));
  }, [mid, price]);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <CoinIcon symbol={pair.base} size={20} />
        <span className="text-sm font-medium">
          {pair.base} / {pair.quote}
        </span>
      </div>

      <div className="mt-3 flex gap-1 rounded-full bg-surface-muted p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 rounded-full py-1.5 text-sm font-semibold capitalize transition-colors ${
              side === s ? (s === "buy" ? "bg-accent text-on-accent" : "bg-danger text-white") : "text-ink-soft"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-3 text-sm">
        {(["limit", "market"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={`capitalize ${type === t ? "font-medium text-ink" : "text-ink-faint"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {type === "limit" ? (
          <label className="block">
            <span className="text-xs text-ink-soft">Price ({pair.quote})</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-xl border border-[color:var(--glass-border)] bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]" />
          </label>
        ) : null}
        <label className="block">
          <span className="text-xs text-ink-soft">Amount ({pair.base})</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className="mt-1 h-10 w-full rounded-xl border border-[color:var(--glass-border)] bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]" />
        </label>
      </div>

      <Button className="mt-4 w-full" variant={side === "buy" ? "accent" : "danger"} disabled title="Order placement needs a linked funded wallet + BalanceManager (next)">
        {side === "buy" ? "Buy" : "Sell"} {pair.base}
      </Button>
      <p className="mt-2 text-center text-xs text-ink-faint">Trading needs your linked funded wallet — wiring next.</p>
    </Card>
  );
}
