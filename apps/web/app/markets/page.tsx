"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deepbook } from "@umbra/core";
import { AppNav } from "@/components/app-nav";
import { Card, Spinner } from "@/components/ui";
import { SULTAN_POOL, useDeepBook } from "@/lib/deepbook";

export default function MarketsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-28">
        <h1 className="text-2xl font-bold">Markets</h1>
        <p className="mt-1 text-sm text-ink-soft">Trade creator coins on DeepBook v3.</p>
        {mounted ? <MarketView /> : null}
      </main>
    </>
  );
}

type Level2 = { prices?: number[]; quantities?: number[] };

function MarketView() {
  const db = useDeepBook();
  const book = useQuery({
    queryKey: ["orderbook", SULTAN_POOL.key],
    queryFn: () => deepbook.getOrderBook(db, SULTAN_POOL.key),
    refetchInterval: 6000,
  });

  const mid = book.data?.mid ?? 0;
  const bids = book.data?.bids as Level2 | undefined;
  const asks = book.data?.asks as Level2 | undefined;
  const empty = !bids?.prices?.length && !asks?.prices?.length;

  return (
    <div className="mt-5 space-y-4">
      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="text-lg font-bold">$SULTAN / DEEP</p>
          <p className="font-mono text-xs text-ink-faint">{SULTAN_POOL.id.slice(0, 12)}…</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-soft">Mid price</p>
          <p className="text-xl font-bold">
            {mid > 0 ? mid.toFixed(4) : "—"} <span className="text-sm font-normal text-ink-soft">DEEP</span>
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-3 text-sm font-semibold">Order book</p>
        {book.isLoading ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : book.isError ? (
          <p className="text-sm text-ink-soft">Couldn&apos;t load the book — is the indexer/RPC reachable?</p>
        ) : (
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Bids</p>
              {bids?.prices?.length ? (
                bids.prices.map((p, i) => (
                  <div key={i} className="flex justify-between tabular-nums">
                    <span>{p.toFixed(4)}</span>
                    <span className="text-ink-soft">{bids.quantities?.[i]}</span>
                  </div>
                ))
              ) : (
                <p className="text-ink-faint">—</p>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger">Asks</p>
              {asks?.prices?.length ? (
                asks.prices.map((p, i) => (
                  <div key={i} className="flex justify-between tabular-nums">
                    <span>{p.toFixed(4)}</span>
                    <span className="text-ink-soft">{asks.quantities?.[i]}</span>
                  </div>
                ))
              ) : (
                <p className="text-ink-faint">—</p>
              )}
            </div>
          </div>
        )}
        {!book.isLoading && empty ? (
          <p className="mt-4 text-xs text-ink-faint">
            Fresh pool — no open orders yet. Placing orders (BalanceManager + your linked wallet) is the next step.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
