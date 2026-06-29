"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import Link from "next/link";
import { deepbook } from "@umbra/core";
import { AppShell } from "@/components/app-shell";
import { RightSidebar } from "@/components/right-sidebar";
import { Spinner } from "@/components/ui";
import { CoinIcon, MarketSelect } from "@/components/market-select";
import { PriceChart } from "@/components/price-chart";
import { toast } from "@/components/toaster";
import { useSocialAccount } from "@/lib/account";
import { useGasless } from "@/lib/gasless";
import { COINS, PAIRS, useDeepBook, type Pair } from "@/lib/deepbook";
import { getOracleState, getOracleTrades, listMarkets, toUsd } from "@/lib/predict";

const coinMeta = COINS as Record<string, { type: string; scalar: number }>;

export default function TradePage() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"trade" | "predict">("trade");
  useEffect(() => setMounted(true), []);

  return (
    <AppShell
      flush
      title="Trade"
      subtitle="gasless · DeepBook v3"
      right={<RightSidebar />}
      header={
        <div className="flex gap-8 px-6">
          {(["trade", "predict"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`border-b-[2.5px] pb-3 text-[15px] transition-colors ${
                mode === m ? "border-accent font-bold text-ink" : "border-transparent font-medium text-ink-faint hover:text-ink"
              }`}
            >
              {m === "trade" ? "Swap" : "Predict"}
            </button>
          ))}
        </div>
      }
    >
      <div className="px-6 py-5">
        {mounted ? mode === "trade" ? <Terminal /> : <PredictGrid /> : null}
      </div>
    </AppShell>
  );
}

function PredictGrid() {
  const markets = useQuery({
    queryKey: ["predict-grid"],
    refetchInterval: 30000,
    queryFn: async () => {
      const list = await listMarkets(8);
      return Promise.all(
        list.map(async (m) => {
          const [trades, state] = await Promise.all([
            getOracleTrades(m.oracle_id, 50).catch(() => []),
            getOracleState(m.oracle_id).catch(() => null),
          ]);
          const volume = trades.reduce((s, t) => s + t.quantity, 0);
          const lp = state?.latest_price;
          const fwd = lp ? toUsd(lp.forward || lp.spot) : 0;
          const strike = fwd > 0 ? Math.round(fwd / 1000) * 1000 : 0;
          const yes = strike > 0 ? Math.round(predictUpProb(fwd, strike, m.expiry - Date.now()) * 100) : 50;
          const left = Math.max(0, m.expiry - Date.now());
          const h = Math.floor(left / 3600000);
          const closes = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`;
          return { id: m.oracle_id, strike, yes, volume, closes };
        }),
      );
    },
  });

  if (markets.isLoading) return <div className="grid place-items-center py-16"><Spinner /></div>;
  if (!markets.data?.length) return <p className="py-16 text-center text-sm text-ink-soft">No active markets right now.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {markets.data.map((m) => (
        <Link
          key={m.id}
          href={`/m/${m.id}`}
          className="lift flex flex-col gap-3 rounded-[20px] border border-[color:var(--glass-border)] bg-surface-glass p-5"
        >
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-coral">
            <CrosshairGlyph /> BTC Binary
          </div>
          <h3 className="text-[18px] font-bold leading-[1.25]">
            {m.strike > 0 ? `BTC > $${m.strike.toLocaleString()} at expiry?` : "BTC binary — live"}
          </h3>
          <div className="mt-auto flex items-end gap-1.5">
            <span className="text-[34px] font-black leading-[0.9] text-[#0a8a5b]">{m.yes}</span>
            <span className="mb-1 font-mono text-[12px] text-ink-faint">% YES</span>
          </div>
          <div className="h-[7px] overflow-hidden rounded-[10px] bg-[color:color-mix(in_srgb,var(--ink)_10%,transparent)]">
            <div className="h-full rounded-[10px]" style={{ width: `${m.yes}%`, background: "linear-gradient(90deg,#7CFCD8,#18C2C2)" }} />
          </div>
          <div className="flex justify-between font-mono text-[11px] text-ink-faint">
            <span>{m.volume >= 1000 ? `${(m.volume / 1000).toFixed(1)}K` : m.volume.toFixed(0)} vol</span>
            <span>closes {m.closes}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// implied P(up) — lognormal forward model (mirrors the market page).
function predictUpProb(forward: number, strike: number, ms: number): number {
  if (forward <= 0 || strike <= 0 || ms <= 0) return 0.5;
  const T = ms / (365.25 * 24 * 3600 * 1000);
  const sig = 0.6 * Math.sqrt(Math.max(T, 1e-9));
  const d2 = (Math.log(forward / strike) - 0.18 * T) / sig;
  const t = 1 / (1 + 0.2316419 * Math.abs(d2));
  const d = 0.3989422804014327 * Math.exp((-d2 * d2) / 2);
  const pp = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = d2 >= 0 ? 1 - pp : pp;
  return Math.min(0.98, Math.max(0.02, cdf));
}

function CrosshairGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </svg>
  );
}

type Level = { price: number; size: number };
const fmtPrice = (p: number) => (p === 0 ? "—" : p < 1 ? p.toPrecision(4) : p.toLocaleString(undefined, { maximumFractionDigits: 4 }));
const fmtSize = (s: number) => s.toLocaleString(undefined, { maximumFractionDigits: 3 });

const card = "rounded-[20px] border border-[color:var(--glass-border)] bg-surface-glass";

function Terminal() {
  const db = useDeepBook();
  const [pairKey, setPairKey] = useState("SUI_DBUSDC");
  const pair = PAIRS.find((p) => p.key === pairKey) ?? PAIRS[0]!;

  const book = useQuery({
    queryKey: ["orderbook", pairKey],
    queryFn: () => deepbook.getOrderBook(db, pairKey),
    refetchInterval: 6000,
  });

  const asks: Level[] = (book.data?.asks ?? []).slice(0, 7);
  const bids: Level[] = (book.data?.bids ?? []).slice(0, 7);
  const maxSize = Math.max(1, ...asks.map((l) => l.size), ...bids.map((l) => l.size));
  const mid = book.data?.mid ?? 0;

  return (
    <div className="space-y-[18px]">
      {/* pair head + chart */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MarketSelect value={pairKey} onChange={setPairKey} />
          <div className="text-right">
            <div className="font-mono text-[11px] text-ink-faint">mid price</div>
            <div className="text-[22px] font-black tabular-nums">
              {fmtPrice(mid)} <span className="text-[14px] font-medium text-ink-faint">{pair.quote}</span>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <PriceChart poolKey={pairKey} />
        </div>
      </div>

      {/* swap + order book */}
      <div className="grid gap-[18px] md:grid-cols-[1.1fr_.9fr]">
        <SwapCard pair={pair} pairKey={pairKey} mid={mid} />
        <div className={`${card} p-[18px]`}>
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">Order book</div>
          {book.isLoading ? (
            <div className="grid place-items-center py-10"><Spinner /></div>
          ) : asks.length === 0 && bids.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">No resting orders on this pool yet.</p>
          ) : (
            <div>
              <div className="space-y-0.5">
                {[...asks].reverse().map((l, i) => <Row key={`a${i}`} l={l} side="ask" max={maxSize} />)}
              </div>
              <div className="my-2 border-t border-[color:var(--glass-border)] pt-2 text-center font-mono text-[14px] font-bold text-[#0a8a5b]">
                {fmtPrice(mid)} ▲
              </div>
              <div className="space-y-0.5">
                {bids.map((l, i) => <Row key={`b${i}`} l={l} side="bid" max={maxSize} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ l, side, max }: { l: Level; side: "ask" | "bid"; max: number }) {
  const color = side === "ask" ? "var(--danger)" : "#0a8a5b";
  const bg = side === "ask" ? "rgba(226,85,74,.08)" : "rgba(10,138,91,.08)";
  return (
    <div className="relative flex items-center justify-between px-1 py-1 font-mono text-[12px] tabular-nums">
      <div className="absolute inset-y-0 right-0 rounded-[3px]" style={{ width: `${(l.size / max) * 100}%`, background: bg }} />
      <span className="relative z-10 font-bold" style={{ color }}>{fmtPrice(l.price)}</span>
      <span className="relative z-10 text-[#3a3a42]">{fmtSize(l.size)}</span>
    </div>
  );
}

function ArrowsUpDown() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3" />
    </svg>
  );
}

function SwapCard({ pair, pairKey, mid }: { pair: Pair; pairKey: string; mid: number }) {
  const db = useDeepBook();
  const run = useGasless();
  const account = useSocialAccount();
  const client = useSuiClient();
  const qc = useQueryClient();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  // DEEP-paired official pools are whitelisted (no DEEP fee); our creator pool isn't.
  const whitelisted = !pairKey.startsWith("SULTAN");
  // a buy spends the quote coin (→ base); a sell spends the base coin (→ quote).
  const inputCoin = side === "buy" ? pair.quote : pair.base;
  const outputCoin = side === "buy" ? pair.base : pair.quote;

  const balances = useQuery({
    queryKey: ["balances", account?.address, pairKey],
    queryFn: async () => {
      const get = async (sym: string) => {
        const m = coinMeta[sym];
        if (!m) return 0;
        const b = await client.getBalance({ owner: account!.address, coinType: m.type });
        return Number(b.totalBalance) / m.scalar;
      };
      const [base, quote] = await Promise.all([get(pair.base), get(pair.quote)]);
      return { base, quote };
    },
    enabled: Boolean(account),
    refetchInterval: 10000,
  });
  const inputBal = inputCoin === pair.base ? balances.data?.base : balances.data?.quote;

  async function execute() {
    if (!account) return toast("Sign in first");
    const amt = Number(amount);
    if (!amt) return toast("Enter an amount");
    if (inputBal != null && amt > inputBal) return toast(`Insufficient ${inputCoin} balance`);
    // Creator-coin (permissionless) pools can't price DEEP fees on this testnet
    // pool, so swaps abort at the protocol level. Disabled until the pool is
    // recreated under the current DeepBook package.
    if (!whitelisted) return toast("Creator-coin trading is coming soon");
    setBusy(true);
    try {
      const inMeta = coinMeta[inputCoin];
      if (!inMeta) throw new Error(`Unknown coin ${inputCoin}`);
      const tx = new Transaction();
      deepbook.addSwap(
        db,
        tx,
        {
          poolKey: pairKey,
          direction: side === "buy" ? "quoteToBase" : "baseToQuote",
          amount: amt,
          inputType: inMeta.type,
          inputScalar: inMeta.scalar,
          deepAmount: whitelisted ? 0 : 1,
          minOut: 0,
        },
        account.address,
      );
      await run(tx);
      toast(`Swapped ✓ — ${side === "buy" ? "bought" : "sold"} ${pair.base}`);
      setAmount("");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["balances"] }), 2500);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setBusy(false);
    }
  }

  const recvEst = Number(amount) > 0 && mid > 0 ? (side === "buy" ? Number(amount) / mid : Number(amount) * mid) : 0;
  const rate = mid > 0 ? (side === "buy" ? 1 / mid : mid) : 0;
  const canSwap = whitelisted && Number(amount) > 0 && Boolean(account) && !busy;

  return (
    <div className={`${card} relative p-2`}>
      {/* YOU PAY */}
      <div className="p-[18px]">
        <div className="mb-1.5 font-mono text-[10.5px] text-ink-faint">YOU PAY</div>
        <div className="flex items-center justify-between gap-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-0 flex-1 bg-transparent text-[28px] font-bold outline-none placeholder:text-ink-faint"
          />
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-[color:color-mix(in_srgb,var(--ink)_6%,transparent)] py-[7px] pl-[7px] pr-[13px]">
            <CoinIcon symbol={inputCoin} size={26} />
            <span className="font-bold">{inputCoin}</span>
          </span>
        </div>
        <div className="mt-1.5 font-mono text-[11px] text-ink-faint">
          Balance {balances.data ? fmtSize(inputBal ?? 0) : balances.isError ? "—" : "…"} {inputCoin}
          {account && inputBal ? (
            <button type="button" onClick={() => setAmount(String(Number(inputBal.toPrecision(6))))} className="ml-2 text-accent hover:underline">
              max
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-[14px] h-px bg-[color:var(--glass-border)]" />

      {/* YOU RECEIVE */}
      <div className="p-[18px]">
        <div className="mb-1.5 font-mono text-[10.5px] text-ink-faint">YOU RECEIVE</div>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1 truncate text-[28px] font-bold tabular-nums text-[#0a8a5b]">{recvEst > 0 ? fmtSize(recvEst) : "0"}</span>
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-[color:color-mix(in_srgb,var(--ink)_6%,transparent)] py-[7px] pl-[7px] pr-[13px]">
            <CoinIcon symbol={outputCoin} size={26} />
            <span className="font-bold">{outputCoin}</span>
          </span>
        </div>
      </div>

      {/* flip side */}
      <button
        type="button"
        onClick={() => setSide(side === "buy" ? "sell" : "buy")}
        aria-label="Flip"
        className="absolute left-1/2 top-1/2 grid h-[36px] w-[36px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-on-accent ring-4 ring-[color:var(--surface)]"
      >
        <ArrowsUpDown />
      </button>

      <div className="px-[18px] pb-4 pt-1">
        <div className="flex justify-between py-[6px] font-mono text-[11px] text-ink-faint">
          <span>{rate > 0 ? `1 ${inputCoin} = ${fmtPrice(rate)} ${outputCoin}` : "—"}</span>
          <span className="text-[#0a8a5b]">⛽ gas sponsored</span>
        </div>
        <button
          onClick={execute}
          disabled={!canSwap}
          className="lift mt-2 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent py-[15px] text-[16px] font-bold text-on-accent disabled:opacity-50"
        >
          {busy ? <Spinner className="border-on-accent" /> : null}
          {!whitelisted ? "Coming soon" : !account ? "Sign in to swap" : "Swap · gasless"}
        </button>
        <p className="mt-2 text-center font-mono text-[10.5px] text-ink-faint">fill capped by pool liquidity · the rest refunds</p>
      </div>
    </div>
  );
}
