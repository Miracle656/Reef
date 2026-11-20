"use client";

import { useState } from "react";
import { swap, wallet } from "@umbra/core";
import { swapErrorMessage, swapMarket, useSwapRules, useWalletSwap, type PreparedSwap } from "@/lib/wallet-swap";
import { toast } from "./toaster";
import { Button, Card, Input, Spinner } from "./ui";

type Step =
  | { name: "form" }
  /** quoted, built and dry-run on the network; nothing has been signed */
  | { name: "review"; prepared: PreparedSwap }
  | { name: "done"; received: bigint; exact: boolean; digest: string };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-ink-soft">{label}</span>
      <span className="min-w-0 text-right text-sm font-semibold text-ink">{children}</span>
    </div>
  );
}

/**
 * "Swap": SUI in this wallet -> USDC in this wallet, on DeepBook.
 * form -> review -> done. The review shows a swap that has already been dry-run
 * on the network, and the confirm button signs exactly those bytes; the least
 * it may pay out is inside them, so a price that moves too far cancels it.
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
  /** millionths of a dollar per SUI, for a rough figure while typing; the review uses the real quote */
  price: bigint | undefined;
  /** development preview of someone else's address: nothing can be signed */
  viewOnly: boolean;
}) {
  const { prepare, run, canSign } = useWalletSwap();
  const rules = useSwapRules(address);

  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>({ name: "form" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!swapMarket) return null;
  const { from, to } = swapMarket;
  const held = balances.find((b) => b.coin.symbol === from.symbol)?.total ?? 0n;
  const fromText = (v: bigint, digits = 4) => `${wallet.formatAmount(v, from.decimals, digits)} ${from.symbol}`;
  const toText = (v: bigint) => `${wallet.formatAmount(v, to.decimals, 4)} ${to.symbol}`;
  const most = rules.data ? swap.maxSwap(rules.data, held) : 0n;

  // A rough dollar figure for what's typed, before the market is asked.
  let typed: bigint | null = null;
  try {
    typed = amount.trim() ? wallet.toBaseUnits(amount, from.decimals) : null;
  } catch {
    typed = null;
  }
  const rough = typed !== null && typed > 0n && price ? (typed * price) / 10n ** BigInt(from.decimals) : null;

  async function review() {
    setError(null);
    if (!rules.data) return setError("Still loading the market. Try again in a moment.");
    let value: bigint;
    try {
      value = wallet.toBaseUnits(amount, from.decimals);
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
        <div className="mt-3 divide-y divide-[color:var(--glass-border)]">
          <Row label="You pay">{fromText(p.paid, 6)}</Row>
          <Row label="You get">
            {toText(p.received)}
            <span className="block text-xs font-medium text-ink-faint">at least {toText(p.minReceived)}, or the swap cancels itself</span>
          </Row>
          <Row label="Rate">
            1 {from.symbol} = {wallet.formatAmount(rate, to.decimals, 4)} {to.symbol}
          </Row>
          <Row label="Network fee">{p.fee === 0n ? "None" : `${wallet.formatAmount(p.fee, 9, 6)} SUI`}</Row>
        </div>
        {rules.data && kept > 0n ? (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            This market trades {from.symbol} in steps of {fromText(rules.data.step, 2)}, so {fromText(kept)} of what you entered stays in your wallet.
          </p>
        ) : null}
        <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
          The swap trades on DeepBook, Sui&apos;s own exchange, at the price you see. ReeF takes no fee. A swap can&apos;t be undone.
        </p>
        {viewOnly ? <p className="mt-3 text-sm font-medium text-ink-soft">Preview only: sign in on the live site to swap.</p> : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="accent" disabled={busy || viewOnly || !canSign} onClick={() => confirm(p)}>
            {busy ? <Spinner className="border-on-accent" /> : null}
            {busy ? "Swapping…" : `Swap for ${toText(p.received)}`}
          </Button>
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
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">
        Swap {from.symbol} to {to.symbol}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">Turn the {from.symbol} in this wallet into dollars you can send or cash out.</p>

      <label className="mt-4 block">
        <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-faint">
          <span>{from.symbol} to swap</span>
          <span className="normal-case tracking-normal">You have {fromText(held)}</span>
        </span>
        <div className="relative mt-1.5">
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            className="pr-20 font-mono"
          />
          <button
            type="button"
            disabled={most <= 0n}
            onClick={() => {
              setAmount(wallet.formatUnits(most, from.decimals));
              setError(null);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-bold text-accent hover:bg-surface-muted disabled:opacity-40"
          >
            Max
          </button>
        </div>
      </label>

      <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
        {rough !== null ? `About $${wallet.formatAmount(rough, 6)} at today's price. ` : ""}
        {rules.data
          ? `The smallest swap is ${fromText(rules.data.smallest, 2)}, in steps of ${fromText(rules.data.step, 2)}. ${fromText(swap.SWAP_FEE_RESERVE, 2)} stays behind for the network fee.`
          : rules.isError
            ? "The market isn't answering right now. Try again in a moment."
            : "Loading the market…"}
      </p>
      {rules.data && most <= 0n ? (
        <p className="mt-2 text-[13px] font-medium text-ink-soft">
          You need a little over {fromText(rules.data.smallest + swap.SWAP_FEE_RESERVE, 2)} in this wallet to make a swap.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Button className="mt-5" disabled={busy || !amount.trim() || !rules.data} onClick={review}>
        {busy ? <Spinner className="border-on-ink" /> : null}
        {busy ? "Checking the market…" : "Review"}
      </Button>
    </Card>
  );
}
