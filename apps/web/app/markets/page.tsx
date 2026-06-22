"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deepbook } from "@umbra/core";
import { AppNav } from "@/components/app-nav";
import { Button, Card, Spinner } from "@/components/ui";
import { PAIRS, useDeepBook } from "@/lib/deepbook";

export default function MarketsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-28">
        <h1 className="text-2xl font-bold">Markets</h1>
        <p className="mt-1 text-sm text-ink-soft">Trade on DeepBook v3.</p>
        {mounted ? <Terminal /> : null}
      </main>
    </>
  );
}

type Level = { price: number; size: number };
const levels = (r?: { prices: number[]; quantities: number[] }): Level[] =>
  r ? r.prices.map((price, i) => ({ price, size: r.quantities[i] ?? 0 })).filter((l) => l.size > 0) : [];

const fmtPrice = (p: number) => (p === 0 ? "—" : p < 1 ? p.toPrecision(4) : p.toLocaleString(undefined, { maximumFractionDigits: 4 }));
const fmtSize = (s: number) => s.toLocaleString(undefined, { maximumFractionDigits: 3 });

function Terminal() {
  const db = useDeepBook();
  const [pairKey, setPairKey] = useState("SULTAN_DEEP");
  const pair = PAIRS.find((p) => p.key === pairKey) ?? PAIRS[0]!;

  const book = useQuery({
    queryKey: ["orderbook", pairKey],
    queryFn: () => deepbook.getOrderBook(db, pairKey),
    refetchInterval: 6000,
  });

  const asks = useMemo(() => levels(book.data?.asks).sort((a, b) => a.price - b.price).slice(0, 9), [book.data]);
  const bids = useMemo(() => levels(book.data?.bids).sort((a, b) => b.price - a.price).slice(0, 9), [book.data]);
  const maxSize = Math.max(1, ...asks.map((l) => l.size), ...bids.map((l) => l.size));
  const bestAsk = asks.length ? asks[asks.length - 1]!.price : undefined;
  const bestBid = bids[0]?.price;
  const mid = book.data?.mid || (bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0);
  const spread = bestBid && bestAsk ? bestAsk - bestBid : undefined;

  return (
    <div className="mt-5 space-y-4">
      {/* pair selector + mid */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="relative">
          <select
            value={pairKey}
            onChange={(e) => setPairKey(e.target.value)}
            className="appearance-none rounded-full border-2 border-border-strong bg-surface px-4 py-2 pr-9 text-base font-bold focus:outline-none"
          >
            {PAIRS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.base} / {p.quote}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">▾</span>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Mid price</p>
          <p className="text-xl font-bold tabular-nums">
            {fmtPrice(mid)} <span className="text-sm font-normal text-ink-soft">{pair.quote}</span>
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        {/* order book ladder */}
        <Card className="p-4">
          <div className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-ink-faint">
            <span>Price ({pair.quote})</span>
            <span>Size ({pair.base})</span>
          </div>
          {book.isLoading ? (
            <div className="grid place-items-center py-10">
              <Spinner />
            </div>
          ) : asks.length === 0 && bids.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">
              No resting orders on this pool yet.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="space-y-0.5">
                {[...asks].reverse().map((l, i) => (
                  <Row key={`a${i}`} l={l} side="ask" max={maxSize} />
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-muted px-2 py-1 text-sm">
                <span className="font-bold tabular-nums">{fmtPrice(mid)}</span>
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

        {/* trade panel */}
        <TradePanel pair={pair} mid={mid} />
      </div>
    </div>
  );
}

function Row({ l, side, max }: { l: Level; side: "ask" | "bid"; max: number }) {
  const color = side === "ask" ? "var(--danger)" : "var(--accent)";
  return (
    <div className="relative flex items-center justify-between rounded-md px-2 py-1 text-sm tabular-nums">
      <div
        className="absolute inset-y-0 right-0 rounded-md opacity-15"
        style={{ width: `${(l.size / max) * 100}%`, backgroundColor: color }}
      />
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
      <div className="flex gap-1 rounded-full bg-surface-muted p-1">
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
          <button
            key={t}
            onClick={() => setType(t)}
            className={`capitalize ${type === t ? "font-semibold text-ink" : "text-ink-faint"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {type === "limit" ? (
          <label className="block">
            <span className="text-xs text-ink-soft">Price ({pair.quote})</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              className="mt-1 h-10 w-full rounded-xl border-2 border-border-strong bg-surface px-3 text-sm focus:outline-none"
            />
          </label>
        ) : null}
        <label className="block">
          <span className="text-xs text-ink-soft">Amount ({pair.base})</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="mt-1 h-10 w-full rounded-xl border-2 border-border-strong bg-surface px-3 text-sm focus:outline-none"
          />
        </label>
      </div>

      <Button
        className="mt-4 w-full"
        variant={side === "buy" ? "accent" : "danger"}
        disabled
        title="Order placement needs a linked funded wallet + BalanceManager (next step)"
      >
        {side === "buy" ? "Buy" : "Sell"} {pair.base}
      </Button>
      <p className="mt-2 text-center text-xs text-ink-faint">
        Trading needs your linked funded wallet + a BalanceManager — wiring next.
      </p>
    </Card>
  );
}
