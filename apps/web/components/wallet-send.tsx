"use client";

import { useState } from "react";
import { wallet } from "@umbra/core";
import { sendErrorMessage, useWalletSend, useWalletSession, type PreparedSend, type SigningState } from "@/lib/wallet";
import { toast } from "./toaster";
import { Button, Card, Input, Spinner } from "./ui";

/** SUI left behind by "Max" so the transfer can still pay its own network fee. */
const SUI_FEE_RESERVE = 20_000_000n; // 0.02 SUI

type Step = { name: "form" } | { name: "review"; prepared: PreparedSend } | { name: "done"; prepared: PreparedSend; digest: string };

const amountText = (coin: wallet.WalletCoin, value: bigint) => `${wallet.formatAmount(value, coin.decimals, coin.decimals)} ${coin.symbol}`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-ink-soft">{label}</span>
      <span className="min-w-0 text-right text-sm font-semibold text-ink">{children}</span>
    </div>
  );
}

/**
 * "Send": form -> review -> sent. The review step shows a transfer that has
 * already been built and dry-run on the network, and the confirm button signs
 * exactly those bytes.
 */
export function WalletSend({
  address,
  config,
  balances,
  viewOnly,
  signing,
}: {
  address: string;
  config: wallet.WalletConfig;
  balances: wallet.WalletBalance[];
  /** development preview of someone else's address: nothing can be signed */
  viewOnly: boolean;
  signing: SigningState | undefined;
}) {
  const { prepare, send, canSign } = useWalletSend();
  const session = useWalletSession(viewOnly ? null : address);

  // Start on the first coin the account actually holds.
  const [symbol, setSymbol] = useState(() => (balances.find((b) => b.total > 0n) ?? balances[0])?.coin.symbol ?? "");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<Step>({ name: "form" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = balances.find((b) => b.coin.symbol === symbol) ?? balances[0];
  if (!selected) return null;
  const coin = selected.coin;
  const max = coin.gasless ? selected.total : selected.total > SUI_FEE_RESERVE ? selected.total - SUI_FEE_RESERVE : 0n;

  if (signing === "not-enabled") {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-bold">Send</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Sending isn&apos;t switched on yet. You can already receive money here, and it will be ready to send as soon as sending opens.
        </p>
      </Card>
    );
  }

  async function review() {
    setError(null);
    let value: bigint;
    let to: string;
    try {
      value = wallet.toBaseUnits(amount, coin.decimals);
      if (value <= 0n) throw new wallet.WalletInputError("Enter an amount");
      if (value > selected!.total) throw new wallet.WalletInputError(`You only have ${amountText(coin, selected!.total)}`);
      to = wallet.parseRecipient(recipient);
    } catch (e) {
      setError(sendErrorMessage(e));
      return;
    }
    setBusy(true);
    try {
      setStep({ name: "review", prepared: await prepare(address, { coin, amount: value, recipient: to }) });
    } catch (e) {
      setError(sendErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(prepared: PreparedSend) {
    setError(null);
    setBusy(true);
    try {
      const { digest } = await send(prepared);
      setStep({ name: "done", prepared, digest });
      toast(`Sent ${amountText(prepared.coin, prepared.amount)} ✓`);
    } catch (e) {
      setError(sendErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setAmount("");
    setRecipient("");
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
            <h2 className="text-lg font-bold">Sent {amountText(step.prepared.coin, step.prepared.amount)}</h2>
            <p className="font-mono text-xs text-ink-faint">to {step.prepared.recipient.slice(0, 10)}…{step.prepared.recipient.slice(-6)}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={reset}>Done</Button>
          <a
            href={wallet.explorerTxUrl(config.network, step.digest)}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-accent hover:underline"
          >
            View receipt
          </a>
        </div>
      </Card>
    );
  }

  if (step.name === "review") {
    const p = step.prepared;
    return (
      <Card className="p-5">
        <h2 className="text-lg font-bold">Check and send</h2>
        <div className="mt-3 divide-y divide-[color:var(--glass-border)]">
          <Row label="You send">{amountText(p.coin, p.amount)}</Row>
          <Row label="To">
            <code className="break-all font-mono text-[12.5px] font-medium leading-relaxed">{p.recipient}</code>
          </Row>
          {/* A paid transfer can still net out to zero: merging many small coins refunds more storage than the fee costs. */}
          <Row label="Network fee">{p.fee === 0n ? "None" : `${wallet.formatAmount(p.fee, 9, 6)} SUI`}</Row>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
          Transfers can&apos;t be undone, so check the address.
          {p.gasless && config.network === "mainnet" ? " Paying into an exchange for the first time? Send a small amount first." : ""}
          {session.data === false ? " Google will open once to confirm it's you." : ""}
        </p>
        {viewOnly ? <p className="mt-3 text-sm font-medium text-ink-soft">Preview only: sign in on the live site to send.</p> : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="accent" disabled={busy || viewOnly || !canSign} onClick={() => confirm(p)}>
            {busy ? <Spinner className="border-on-accent" /> : null}
            {busy ? "Sending…" : `Send ${amountText(p.coin, p.amount)}`}
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
      <h2 className="text-lg font-bold">Send</h2>

      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Coin">
        {balances.map((b) => {
          const on = b.coin.symbol === coin.symbol;
          return (
            <button
              key={b.coin.symbol}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setSymbol(b.coin.symbol);
                setError(null);
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                on ? "bg-ink text-on-ink" : "border border-[color:var(--glass-border)] text-ink-soft hover:text-ink"
              }`}
            >
              {b.coin.symbol}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-faint">
          <span>Amount</span>
          <span className="normal-case tracking-normal">You have {amountText(coin, selected.total)}</span>
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
            disabled={max <= 0n}
            onClick={() => {
              setAmount(wallet.formatUnits(max, coin.decimals));
              setError(null);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-bold text-accent hover:bg-surface-muted disabled:opacity-40"
          >
            Max
          </button>
        </div>
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">To</span>
        <Input
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="0x… Sui address"
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value);
            setError(null);
          }}
          className="mt-1.5 font-mono text-[13px]"
        />
      </label>

      {coin.gasless ? (
        <p className="mt-3 text-[13px] text-ink-soft">No network fee for {coin.symbol}. You don&apos;t need any SUI to send it.</p>
      ) : (
        <p className="mt-3 text-[13px] text-ink-soft">Sending {coin.symbol} costs a small network fee, paid from the same balance.</p>
      )}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <Button className="mt-5" disabled={busy || !amount.trim() || !recipient.trim()} onClick={review}>
        {busy ? <Spinner className="border-on-ink" /> : null}
        {busy ? "Checking…" : "Review"}
      </Button>
    </Card>
  );
}
