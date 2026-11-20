"use client";

import { useEffect, useRef, useState } from "react";
import { swap, wallet } from "@umbra/core";
import { swapErrorMessage, swapMarket, useSwapRules, useWalletSwap, type PreparedSwap, type SwapEstimate } from "@/lib/wallet-swap";
import { toast } from "./toaster";
import { Button, Card, Spinner } from "./ui";

type Step =
  | { name: "form" }
  /** quoted, built and dry-run on the network; nothing has been signed */
  | { name: "review"; prepared: PreparedSwap }
  | { name: "done"; received: bigint; exact: boolean; digest: string };

const ICONS: Record<string, string> = { USDC: "/usdc.png", SUI: "/sui.png" };

/** The coin a side of the swap is in: its icon and ticker in a pill. */
function CoinChip({ symbol }: { symbol: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--glass-border)] bg-surface-glass py-1 pl-1 pr-3 text-sm font-bold backdrop-blur-xl">
      <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-surface-muted">
        {ICONS[symbol] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ICONS[symbol]} alt="" className="h-full w-full object-cover" />
        ) : (
          "$"
        )}
      </span>
      {symbol}
    </span>
  );
}

/** "How much of this is in the wallet", with a small wallet glyph. */
function Held({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm text-ink-soft">
      <svg className="h-4 w-4 text-ink-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M16 12.5h2" />
        <path d="M3 10h18" />
      </svg>
      {children}
    </span>
  );
}

/** The line between the two sides, with the direction of the swap on it. */
function Arrow() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-[color:var(--glass-border)]" />
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-on-accent">
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
      </span>
      <span className="h-px flex-1 bg-[color:var(--glass-border)]" />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-ink-soft">{label}</span>
      <span className="min-w-0 text-right text-sm font-semibold text-ink">{children}</span>
    </div>
  );
}

const BIG = "text-[40px] font-black leading-none tracking-tight";

/**
 * "Swap": SUI in this wallet -> USDC in this wallet, on DeepBook.
 *
 * One screen, the way swaps usually look: what you give on top with quick
 * amounts, an arrow, what you get underneath, filled in from the market as you
 * type. "Review" then dry-runs the exact swap on the network, and the confirm
 * button signs exactly those bytes; the least it may pay out is inside them, so
 * a price that moves too far cancels it.
 */
export function WalletSwap({
  address,
  config,
  balances,
  price,
  viewOnly,
}: {
  address: string;
  config: wallet.WalletConfig;
  balances: wallet.WalletBalance[];
  /** millionths of a dollar per SUI, for the dollar figure under the amount */
  price: bigint | undefined;
  /** development preview of someone else's address: nothing can be signed */
  viewOnly: boolean;
}) {
  const { estimate, prepare, run, canSign } = useWalletSwap();
  const rules = useSwapRules(address);

  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>({ name: "form" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** what the market says the typed amount would fetch, refreshed as it changes */
  const [quote, setQuote] = useState<SwapEstimate | null>(null);
  const [quoting, setQuoting] = useState(false);
  /** why there is no estimate; `blocks` when the amount itself is the reason, so trying again can't help */
  const [problem, setProblem] = useState<{ text: string; blocks: boolean } | null>(null);
  const seq = useRef(0);

  const from = swapMarket?.from;
  const to = swapMarket?.to;
  const held = balances.find((b) => b.coin.symbol === from?.symbol)?.total ?? 0n;
  const heldTo = balances.find((b) => b.coin.symbol === to?.symbol)?.total ?? 0n;

  let typed: bigint | null = null;
  let unreadable: string | null = null;
  if (amount.trim() && from) {
    try {
      typed = wallet.toBaseUnits(amount, from.decimals);
    } catch (e) {
      unreadable = swapErrorMessage(e);
    }
  }

  // Fill in the other side from the market, a moment after the typing stops.
  useEffect(() => {
    const mine = ++seq.current;
    setQuote(null);
    setProblem(null);
    if (step.name !== "form" || !rules.data || typed === null || typed <= 0n) {
      setQuoting(false);
      return;
    }
    setQuoting(true);
    const wait = setTimeout(async () => {
      try {
        const q = await estimate(address, typed!, held, rules.data!);
        if (seq.current === mine) setQuote(q);
      } catch (e) {
        if (seq.current === mine) setProblem({ text: swapErrorMessage(e), blocks: e instanceof wallet.WalletInputError });
      } finally {
        if (seq.current === mine) setQuoting(false);
      }
    }, 450);
    return () => {
      clearTimeout(wait);
      seq.current++; // an answer still on its way is for an amount that is no longer on the screen
    };
    // `typed` is derived from `amount`; listing the string keeps this from re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, held, rules.data, address, estimate, step.name]);

  if (!swapMarket || !from || !to) return null;
  const fromText = (v: bigint, digits = 4) => `${wallet.formatAmount(v, from.decimals, digits)} ${from.symbol}`;
  const toText = (v: bigint) => `${wallet.formatAmount(v, to.decimals, 4)} ${to.symbol}`;
  const most = rules.data ? swap.maxSwap(rules.data, held) : 0n;
  /** what a quick-amount button fills in; 0 switches it off (that share is under the market's minimum) */
  const share = (percent: bigint) => (rules.data ? swap.swapShare(rules.data, held, percent) : 0n);
  const dollarsOf = (v: bigint) => (price ? (v * price) / 10n ** BigInt(from.decimals) : null);
  const typedDollars = typed !== null && typed > 0n ? dollarsOf(typed) : null;

  async function review() {
    setError(null);
    if (!rules.data) return setError("Still loading the market. Try again in a moment.");
    let value: bigint;
    try {
      value = wallet.toBaseUnits(amount, from!.decimals);
    } catch (e) {
      return setError(swapErrorMessage(e));
    }
    setBusy(true);
    try {
      setStep({ name: "review", prepared: await prepare(address, value, held, rules.data) });
    } catch (e) {
      setError(swapErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(prepared: PreparedSwap) {
    setError(null);
    setBusy(true);
    try {
      const { digest, outcome } = await run(address, prepared);
      // What really happened if the network told us; otherwise what was reviewed.
      const received = outcome && outcome.received > 0n ? outcome.received : prepared.received;
      setStep({ name: "done", received, exact: Boolean(outcome && outcome.received > 0n), digest });
      toast(`Swapped for ${toText(received)} ✓`);
    } catch (e) {
      setError(swapErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setAmount("");
    setError(null);
    setStep({ name: "form" });
  }

  if (step.name === "done") {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#16c784] text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <div>
            <h2 className="text-lg font-bold">
              You got {step.exact ? "" : "about "}
              {toText(step.received)}
            </h2>
            <p className="text-sm text-ink-soft">It is in this wallet now.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={reset}>Done</Button>
          <a href={wallet.explorerTxUrl(config.network, step.digest)} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent hover:underline">
            View receipt
          </a>
        </div>
      </Card>
    );
  }

  if (step.name === "review") {
    const p = step.prepared;
    // The market sells whole steps; the rest of what was typed never leaves the wallet.
    const kept = p.amount > p.quantity ? p.amount - p.quantity : 0n;
    const rate = p.paid > 0n ? (p.received * 10n ** BigInt(from.decimals)) / p.paid : 0n;
    return (
      <Card className="p-5">
        <h2 className="text-lg font-bold">Check and swap</h2>

        <div className="mt-4 flex items-center justify-between gap-3">
          <CoinChip symbol={from.symbol} />
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">You pay</span>
        </div>
        <p className={`mt-3 break-all ${BIG}`}>{wallet.formatAmount(p.paid, from.decimals, 6)}</p>

        <Arrow />

        <div className="flex items-center justify-between gap-3">
          <CoinChip symbol={to.symbol} />
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">You get</span>
        </div>
        <p className={`mt-3 break-all ${BIG}`}>{wallet.formatAmount(p.received, to.decimals, 4)}</p>

        <div className="mt-5 divide-y divide-[color:var(--glass-border)] border-t border-[color:var(--glass-border)]">
          <Detail label="At least">
            {toText(p.minReceived)}
            <span className="block text-xs font-medium text-ink-faint">or the swap cancels itself</span>
          </Detail>
          <Detail label="Rate">
            1 {from.symbol} = {wallet.formatAmount(rate, to.decimals, 4)} {to.symbol}
          </Detail>
          <Detail label="Network fee">{p.fee === 0n ? "None" : `${wallet.formatAmount(p.fee, 9, 6)} SUI`}</Detail>
        </div>
        {rules.data && kept > 0n ? (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            This market trades {from.symbol} in steps of {fromText(rules.data.step, 2)}, so {fromText(kept)} of what you entered stays in your wallet.
          </p>
        ) : null}
        <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
          Trades on DeepBook, Sui&apos;s own exchange, at the price you see. ReeF takes no fee. A swap can&apos;t be undone.
        </p>
        {viewOnly ? <p className="mt-3 text-sm font-medium text-ink-soft">Preview only: sign in on the live site to swap.</p> : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError(null);
              setStep({ name: "form" });
            }}
          >
            Back
          </Button>
          <Button variant="accent" disabled={busy || viewOnly || !canSign} onClick={() => confirm(p)}>
            {busy ? <Spinner className="border-on-accent" /> : null}
            {busy ? "Swapping…" : "Confirm swap"}
          </Button>
        </div>
      </Card>
    );
  }

  const quick: [string, bigint][] = [
    ["25%", share(25n)],
    ["50%", share(50n)],
    ["Max", share(100n)],
  ];
  const note =
    unreadable ??
    problem?.text ??
    (rules.isError
      ? "The market isn't answering right now. Try again in a moment."
      : rules.data && most <= 0n
        ? `${held === 0n ? `This wallet has no ${from.symbol} yet. ` : ""}You need a little over ${fromText(rules.data.smallest + swap.SWAP_FEE_RESERVE, 2)} here to make a swap.`
        : null);

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">Swap</h2>

      {/* ---- what you give ---- */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <CoinChip symbol={from.symbol} />
        <Held>{wallet.formatAmount(held, from.decimals, 4)}</Held>
      </div>
      <input
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        aria-label={`${from.symbol} to swap`}
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setError(null);
        }}
        className={`mt-3 w-full bg-transparent text-ink placeholder:text-ink-faint focus:outline-none ${BIG}`}
      />
      <p className="mt-1.5 text-sm text-ink-faint">
        {typed !== null && typed > 0n ? (typedDollars !== null ? `$${wallet.formatAmount(typedDollars, 6)}` : "\u00a0") : "$0.00"}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {quick.map(([label, value]) => (
          <button
            key={label}
            type="button"
            disabled={value <= 0n}
            onClick={() => {
              setAmount(wallet.formatUnits(value, from.decimals));
              setError(null);
            }}
            className="h-10 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] text-sm font-bold text-accent transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] disabled:pointer-events-none disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>

      <Arrow />

      {/* ---- what you get ---- */}
      <div className="flex items-center justify-between gap-3">
        <CoinChip symbol={to.symbol} />
        <Held>{wallet.formatAmount(heldTo, to.decimals, 4)}</Held>
      </div>
      <p className={`mt-3 break-all ${BIG} ${quote ? "text-ink" : "text-ink-faint"} ${quoting ? "animate-pulse" : ""}`} aria-live="polite">
        {quote ? wallet.formatAmount(quote.out, to.decimals, 4) : "0"}
      </p>
      <p className="mt-1.5 text-sm text-ink-faint">{quote ? `$${wallet.formatAmount(quote.out, to.decimals)}` : "$0.00"}</p>

      {quote && quote.quantity > 0n ? (
        <div className="mt-4 divide-y divide-[color:var(--glass-border)] border-t border-[color:var(--glass-border)]">
          <Detail label="Rate">
            1 {from.symbol} = {wallet.formatAmount((quote.out * 10n ** BigInt(from.decimals)) / quote.quantity, to.decimals, 4)} {to.symbol}
          </Detail>
          <Detail label="At least">{toText(swap.minOutFor(quote.out))}</Detail>
          {rules.data && typed !== null && quote.quantity !== typed ? (
            <Detail label="Swapping">
              {fromText(quote.quantity, 2)}
              <span className="block text-xs font-medium text-ink-faint">this market trades in steps of {fromText(rules.data.step, 2)}</span>
            </Detail>
          ) : null}
        </div>
      ) : null}

      {note ? <p className="mt-4 text-[13px] font-medium leading-relaxed text-ink-soft">{note}</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Button size="lg" className="mt-5 w-full" disabled={busy || quoting || typed === null || typed <= 0n || Boolean(problem?.blocks)} onClick={review}>
        {busy ? <Spinner className="border-on-ink" /> : null}
        {busy ? "Checking the market…" : "Review swap"}
      </Button>
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        {rules.data
          ? `Swaps start at ${fromText(rules.data.smallest, 2)} and go in steps of ${fromText(rules.data.step, 2)}. ${fromText(swap.SWAP_FEE_RESERVE, 2)} stays behind for the network fee.`
          : "Loading the market…"}
      </p>
    </Card>
  );
}
