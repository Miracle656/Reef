"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeStructTag } from "@mysten/sui/utils";
import { cashout, wallet } from "@umbra/core";
import { activeOrder, CashoutApiError, CashoutLockedError, formatNgn, useCashoutApi, type CashoutInfo } from "@/lib/cashout";
import { sendErrorMessage, useWalletSend, type PreparedSend } from "@/lib/wallet";
import { toast } from "./toaster";
import { Badge, Button, Card, Input, Spinner } from "./ui";

type LiveInfo = Extract<CashoutInfo, { available: true }>;
type Order = cashout.CashoutOrderView;

type Step =
  | { name: "form" }
  /** the order exists and its rate is locked; nothing has been sent yet */
  | { name: "review"; order: Order; prepared: PreparedSend | null }
  /** the dollars were sent (or the order is being followed after a reload) */
  | { name: "status"; order: Order };

/** Stop offering "send" this close to the deadline: a transfer that lands late isn't paid out. */
const SAFETY_MARGIN_MS = 45_000;
const POLL_MS = 5_000;

const errorText = (e: unknown) => (e instanceof CashoutApiError ? e.message : sendErrorMessage(e));
const dollars = (cents: bigint) => `$${cashout.fromHundredths(cents)}`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-ink-soft">{label}</span>
      <span className="min-w-0 text-right text-sm font-semibold text-ink">{children}</span>
    </div>
  );
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

const STATUS_TEXT: Record<cashout.CashoutStatus, { title: string; body: string }> = {
  awaiting_deposit: { title: "Waiting for your dollars to arrive", body: "This usually takes under a minute." },
  processing: { title: "Paying your bank", body: "Your dollars arrived. The naira is on its way to your account." },
  paid: { title: "Paid", body: "The naira has been sent to your bank account." },
  failed: { title: "The bank payout failed", body: "The payout provider returns your dollars to this wallet. If they aren't back within an hour, contact support." },
  expired: { title: "This cash-out ran out of time", body: "No dollars arrived within 10 minutes, so nothing was paid." },
};

/**
 * "Cash out": dollars in this wallet -> naira in a Nigerian bank account.
 * form -> review (rate locked, 10 minutes to send) -> status.
 * The dollars go straight from the wallet to the payout provider's one-time
 * address; ReeF never holds them.
 */
export function WalletCashout({
  address,
  config,
  balances,
  info,
  viewOnly,
  onSwap,
}: {
  address: string;
  config: wallet.WalletConfig;
  balances: wallet.WalletBalance[];
  info: LiveInfo;
  viewOnly: boolean;
  /** open the swap screen, when the wallet holds SUI it could turn into dollars first */
  onSwap?: () => void;
}) {
  const api = useCashoutApi();
  const { prepare, send, canSign } = useWalletSend();

  // Only the coins the provider takes, e.g. not SUI.
  const sellable = balances.filter((b) => {
    const c = cashout.cashoutCoinFor(b.coin.symbol);
    return c !== null && info.coins.includes(c);
  });

  const [symbol, setSymbol] = useState(() => (sellable.find((b) => b.total > 0n) ?? sellable[0])?.coin.symbol ?? "");
  const [kind, setKind] = useState<"ngn" | "stable">("ngn");
  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [account, setAccount] = useState<(cashout.BankAccountName & { accountNumber: string }) | null>(null);
  const [step, setStep] = useState<Step>({ name: "form" });
  const [busy, setBusy] = useState<null | "create" | "send" | "resume" | "list">(null);
  /** the bank account is looked up by itself as soon as it is complete */
  const [checking, setChecking] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [lookupAgain, setLookupAgain] = useState(0);
  const lookupSeq = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Order[] | null>(null);
  const [resumable, setResumable] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** following an order has stopped until the wallet confirms again (a passkey prompt needs a tap) */
  const [paused, setPaused] = useState(false);
  /** one id per distinct request, so a retry after a dropped connection can't make a second order */
  const pendingOrderId = useRef<string | null>(null);

  useEffect(() => setResumable(activeOrder.get(address)), [address]);

  // Look the account up once the bank and all ten digits are in. No tap and no
  // passkey prompt: the name on a bank account says nothing about a wallet.
  useEffect(() => {
    if (!bankCode || !cashout.isAccountNumber(accountNumber)) {
      setChecking(false);
      setAccountError(null);
      return;
    }
    if (account && account.bankCode === bankCode && account.accountNumber === accountNumber) return;
    const seq = ++lookupSeq.current;
    setChecking(true);
    setAccountError(null);
    // A short pause, so a pasted or corrected number is looked up once.
    const wait = setTimeout(async () => {
      try {
        const { account: found } = await api(address, { action: "verify-bank", bankCode, accountNumber });
        if (lookupSeq.current === seq) setAccount({ ...found, accountNumber });
      } catch (e) {
        if (lookupSeq.current === seq) setAccountError(errorText(e));
      } finally {
        if (lookupSeq.current === seq) setChecking(false);
      }
    }, 450);
    return () => clearTimeout(wait);
  }, [bankCode, accountNumber, account, address, api, lookupAgain]);

  // A ticking clock for the deadline, only while it matters.
  useEffect(() => {
    if (step.name !== "review") return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step.name]);

  // Follow the order until it is finished. This runs on a timer, so it may only
  // reuse a confirmation the wallet already gave (`quiet`), never ask for one.
  const following = step.name === "status" && !cashout.isTerminal(step.order.status) && !paused ? step.order.id : null;
  useEffect(() => {
    if (!following) return;
    let stopped = false;
    const t = setInterval(async () => {
      try {
        const { order } = await api(address, { action: "get", orderId: following }, { quiet: true });
        if (stopped) return;
        setStep((s) => (s.name === "status" && s.order.id === order.id ? { name: "status", order } : s));
        if (cashout.isTerminal(order.status)) activeOrder.set(address, null);
      } catch (e) {
        // The confirmation ran out: stop and offer a button. Anything else:
        // keep the last known state; the next tick tries again.
        if (e instanceof CashoutLockedError && !stopped) setPaused(true);
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [following, address, api]);

  const selected = sellable.find((b) => b.coin.symbol === symbol) ?? sellable[0];
  if (!selected) {
    return (
      <Card className="p-5">
        <h2 className="text-lg font-bold">Cash out</h2>
        <p className="mt-1 text-sm text-ink-soft">You need USDC or USDSUI in this wallet to cash out to naira.</p>
      </Card>
    );
  }
  const coin = selected.coin;
  const coinKey = cashout.cashoutCoinFor(coin.symbol)!;
  const minCents = BigInt(info.minCents);
  const maxCents = BigInt(info.maxCents);
  const centsUnit = 10n ** BigInt(coin.decimals - 2);
  const haveCents = selected.total / centsUnit;
  const amountOf = (base: bigint) => `${wallet.formatAmount(base, coin.decimals, coin.decimals)} ${coin.symbol}`;

  // What the typed amount means in the other currency, at today's (not yet locked) rate.
  let cents: bigint | null = null;
  let kobo: bigint | null = null;
  let typed: bigint | null = null;
  try {
    typed = amount.trim() ? cashout.toHundredths(amount.trim().replace(/,/g, "")) : null;
  } catch {
    typed = null;
  }
  if (typed !== null && typed > 0n) {
    if (kind === "ngn") {
      kobo = typed;
      cents = info.rate ? cashout.centsForNgn(typed, info.rate) : null;
    } else {
      cents = typed;
      kobo = info.rate ? cashout.koboForCents(typed, info.rate) : null;
    }
  }

  const accountMatches = account !== null && account.bankCode === bankCode && account.accountNumber === accountNumber;
  const blocked = viewOnly || !canSign;

  // Both sides of the amount are shown; whichever was typed last is the one the order is made from.
  const sendValue = kind === "stable" ? amount : cents !== null ? cashout.fromHundredths(cents) : "";
  const getValue = kind === "ngn" ? amount : kobo !== null ? cashout.fromHundredths(kobo) : "";
  // What still stands in the way of Continue, in the order a person would fix it.
  const todo =
    typed === null || typed <= 0n
      ? null
      : cents !== null && cents < minCents
        ? `The smallest cash-out is ${dollars(minCents)}.`
        : cents !== null && cents > maxCents
          ? `The most you can cash out at once is ${dollars(maxCents)}.`
          : cents !== null && cents > haveCents
            ? `You only have ${amountOf(selected.total)}.`
            : !accountMatches
              ? "Add the bank account to pay."
              : null;

  function changed() {
    setError(null);
    pendingOrderId.current = null;
  }

  async function create() {
    setError(null);
    if (typed === null || typed <= 0n) return setError("Enter an amount like 2000 or 2000.50");
    if (cents !== null) {
      if (cents < minCents) return setError(`The smallest cash-out is ${dollars(minCents)}.`);
      if (cents > maxCents) return setError(`The most you can cash out at once is ${dollars(maxCents)}.`);
      if (cents > haveCents) return setError(`You only have ${amountOf(selected!.total)}.`);
    }
    if (!accountMatches) return setError("Check the bank account first.");

    setBusy("create");
    try {
      pendingOrderId.current ??= crypto.randomUUID();
      const { order } = await api(address, {
        action: "create",
        orderId: pendingOrderId.current,
        coin: coinKey,
        amountKind: kind,
        amount: cashout.fromHundredths(typed),
        bankCode,
        accountNumber,
      });
      // The server has checked the provider's answer; check again here before any money moves.
      if (normalizeStructTag(order.coinType) !== normalizeStructTag(coin.type)) throw new Error("This order asks for a different coin. Nothing was sent.");
      if (BigInt(order.amountStable) > selected!.total) {
        throw new Error(`This cash-out needs ${amountOf(BigInt(order.amountStable))} and you have ${amountOf(selected!.total)}. Try a smaller amount.`);
      }
      activeOrder.set(address, order.id);
      setResumable(null);
      setNowMs(Date.now());
      setStep({ name: "review", order, prepared: null });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function sendDollars(order: Order, already: PreparedSend | null) {
    setError(null);
    setBusy("send");
    let prepared = already;
    try {
      // Built once and reused on a retry: the same bytes can only ever execute once.
      prepared ??= await prepare(address, { coin, amount: BigInt(order.amountStable), recipient: order.depositAddress });
      setStep({ name: "review", order, prepared });
      const { digest } = await send(prepared);
      toast(`Sent ${amountOf(prepared.amount)} ✓`);
      let next: Order = { ...order, depositDigest: digest };
      try {
        // `quiet`: the tap was spent on the transfer, so this must not prompt again.
        next = (await api(address, { action: "deposit", orderId: order.id, digest }, { quiet: true })).order;
      } catch {
        /* the transfer is what matters; the status page keeps working without this note */
      }
      setPaused(false);
      setStep({ name: "status", order: next });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function open(orderId: string, why: "resume" | "list") {
    setError(null);
    setBusy(why);
    try {
      const { order } = await api(address, { action: "get", orderId });
      if (cashout.isTerminal(order.status)) activeOrder.set(address, null);
      setResumable(null);
      setPaused(false);
      setStep({ name: "status", order });
    } catch (e) {
      // An order we can no longer read isn't worth offering again.
      if (e instanceof CashoutApiError && e.status === 404) {
        activeOrder.set(address, null);
        setResumable(null);
      }
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadRecent() {
    setError(null);
    setBusy("list");
    try {
      setRecent((await api(address, { action: "list" })).orders);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    setStep({ name: "form" });
    setAmount("");
    setError(null);
    setRecent(null);
    pendingOrderId.current = null;
  }

  const rehearsal = info.mode === "mock" ? (
    <p className="mt-3 rounded-2xl border border-[color:var(--glass-border)] bg-surface-muted px-3 py-2 text-[13px] font-medium text-ink-soft">
      {config.network === "mainnet"
        ? "Rehearsal mode: no bank is paid and no naira moves. The dollars you send are real and go to ReeF's test address."
        : "Rehearsal mode: no bank is paid and no naira moves. Test money only."}
    </p>
  ) : null;

  // ---- status ----------------------------------------------------------------
  if (step.name === "status") {
    const o = step.order;
    const s = STATUS_TEXT[o.status];
    const done = cashout.isTerminal(o.status);
    // "expired" with a transfer on record means the money left but wasn't matched: say so plainly.
    const stranded = o.status === "expired" && o.depositDigest !== null;
    const neverSent = o.status === "expired" && o.depositDigest === null;
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          {done ? (
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-white ${o.status === "paid" ? "bg-[#16c784]" : "bg-danger"}`}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                {o.status === "paid" ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 7v6M12 17h.01" />}
              </svg>
            </span>
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-muted">
              <Spinner />
            </span>
          )}
          <div>
            <h2 className="text-lg font-bold">{s.title}</h2>
            <p className="text-sm text-ink-soft">
              {stranded ? "Your transfer went out but wasn't matched to this cash-out in time. Contact support with the receipt below." : s.body}
            </p>
          </div>
        </div>
        {rehearsal}
        <div className="mt-3 divide-y divide-[color:var(--glass-border)]">
          <Row label={neverSent ? "You were sending" : "You sent"}>{amountOf(BigInt(o.amountStable))}</Row>
          <Row label={o.status === "paid" ? "Bank received" : done ? "Bank was to receive" : "Bank receives"}>{formatNgn(o.amountNgn)}</Row>
          <Row label="To">
            {o.accountName}
            <span className="block text-xs font-medium text-ink-faint">
              {o.bankName} {o.accountNumberMasked}
            </span>
          </Row>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {done ? <Button onClick={startOver}>Done</Button> : null}
          {o.depositDigest ? (
            <a href={wallet.explorerTxUrl(config.network, o.depositDigest)} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent hover:underline">
              View transfer receipt
            </a>
          ) : null}
        </div>
        {!done && paused ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--glass-border)] px-3 py-2.5">
            <p className="text-sm font-medium">Confirm it&apos;s you to keep following this cash-out.</p>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => open(o.id, "resume")}>
              {busy === "resume" ? <Spinner /> : null} Check again
            </Button>
          </div>
        ) : null}
        {!done && error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {!done ? <p className="mt-3 text-xs text-ink-faint">You can close this page. Come back to Cash out to see where it is.</p> : null}
      </Card>
    );
  }

  // ---- review ----------------------------------------------------------------
  if (step.name === "review") {
    const o = step.order;
    const left = o.expiresAtMs - nowMs;
    const tooLate = left <= SAFETY_MARGIN_MS;
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Check and cash out</h2>
          <Badge className={tooLate ? "text-danger" : ""}>{tooLate ? "Time is up" : `Rate held for ${clock(left)}`}</Badge>
        </div>
        {rehearsal}
        <div className="mt-3 divide-y divide-[color:var(--glass-border)]">
          <Row label="You send">{amountOf(BigInt(o.amountStable))}</Row>
          <Row label="Bank receives">{formatNgn(o.amountNgn)}</Row>
          <Row label="Rate">{formatNgn(Number(o.rate).toFixed(2))} per $1</Row>
          <Row label="To">
            {o.accountName}
            <span className="block text-xs font-medium text-ink-faint">
              {o.bankName} {o.accountNumberMasked}
            </span>
          </Row>
          <Row label="Network fee">None</Row>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
          {tooLate
            ? "There isn't enough time left to send safely. Start again to get a fresh rate; nothing has been sent."
            : "Check the account name. Once the dollars are sent this can't be undone."}
        </p>
        {viewOnly ? <p className="mt-3 text-sm font-medium text-ink-soft">Preview only: sign in on the live site to cash out.</p> : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="accent" disabled={busy !== null || blocked || tooLate} onClick={() => sendDollars(o, step.prepared)}>
            {busy === "send" ? <Spinner className="border-on-accent" /> : null}
            {busy === "send" ? "Sending…" : error && step.prepared ? "Try again" : `Send ${amountOf(BigInt(o.amountStable))}`}
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => {
              // Nothing was sent; the unused order simply runs out on its own.
              activeOrder.set(address, null);
              startOver();
            }}
          >
            {tooLate ? "Start again" : "Cancel"}
          </Button>
        </div>
      </Card>
    );
  }

  // ---- form ------------------------------------------------------------------
  const field = "min-w-0 flex-1 bg-transparent text-right font-mono text-[17px] font-semibold text-ink placeholder:text-ink-faint focus:outline-none";
  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold">Cash out to your bank</h2>
      <p className="mt-1 text-sm text-ink-soft">Turn the dollars in this wallet into naira in a Nigerian bank account.</p>
      {rehearsal}

      {resumable ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--glass-border)] px-3 py-2.5">
          <p className="text-sm font-medium">You have a cash-out in progress.</p>
          <Button size="sm" variant="outline" disabled={busy !== null || blocked} onClick={() => open(resumable, "resume")}>
            {busy === "resume" ? <Spinner /> : null} See where it is
          </Button>
        </div>
      ) : null}

      {selected.total === 0n ? (
        <div className="mt-4 rounded-2xl border border-[color:var(--glass-border)] bg-surface-muted px-4 py-3">
          <p className="text-sm font-semibold">You have no {coin.symbol} to cash out yet.</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
            {onSwap ? "Swap some of your SUI for USDC first, or get paid in dollars." : "Get paid in USDC or USDSUI first."} You can still check your bank
            details below.
          </p>
          {onSwap ? (
            <Button size="sm" variant="outline" className="mt-2.5" onClick={onSwap}>
              Swap SUI to USDC
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ---- how much ---- */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Amount</p>
        {sellable.length > 1 ? (
          <div className="flex gap-1.5" role="radiogroup" aria-label="Coin to cash out">
            {sellable.map((b) => {
              const on = b.coin.symbol === coin.symbol;
              return (
                <button
                  key={b.coin.symbol}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setSymbol(b.coin.symbol);
                    changed();
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    on ? "bg-ink text-on-ink" : "border border-[color:var(--glass-border)] text-ink-soft hover:text-ink"
                  }`}
                >
                  {b.coin.symbol}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-2 overflow-hidden rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass backdrop-blur-xl">
        <label className="flex items-center gap-3 px-4 py-3.5">
          <span className="w-[4.5rem] shrink-0 text-sm text-ink-soft">You send</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-label={`${coin.symbol} to send`}
            value={sendValue}
            onChange={(e) => {
              setKind("stable");
              setAmount(e.target.value);
              changed();
            }}
            className={field}
          />
          <span className="w-14 shrink-0 text-sm font-semibold">{coin.symbol}</span>
        </label>
        <label className="flex items-center gap-3 border-t border-[color:var(--glass-border)] px-4 py-3.5">
          <span className="w-[4.5rem] shrink-0 text-sm text-ink-soft">You get</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-label="Naira to receive"
            value={getValue}
            onChange={(e) => {
              setKind("ngn");
              setAmount(e.target.value);
              changed();
            }}
            className={field}
          />
          <span className="w-14 shrink-0 text-sm font-semibold">NGN</span>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-ink-soft">
        <span>{info.rate ? `${formatNgn(info.rate.toFixed(2))} per $1 today. The exact rate is set on the next step.` : "Today's rate isn't available right now."}</span>
        <button
          type="button"
          disabled={haveCents <= 0n}
          onClick={() => {
            setKind("stable");
            setAmount(cashout.fromHundredths(haveCents < maxCents ? haveCents : maxCents));
            changed();
          }}
          className="font-semibold text-accent hover:underline disabled:text-ink-faint disabled:no-underline"
        >
          Use all {amountOf(selected.total)}
        </button>
      </div>

      {/* ---- where to ---- */}
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Pay to</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <select
          aria-label="Bank"
          value={bankCode}
          onChange={(e) => {
            setBankCode(e.target.value);
            setAccount(null);
            changed();
          }}
          className="h-11 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 text-[15px] text-ink backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
        >
          <option value="">Choose a bank</option>
          {cashout.BANKS.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
        <Input
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          aria-label="Account number"
          placeholder="Account number (10 digits)"
          value={accountNumber}
          onChange={(e) => {
            setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
            setAccount(null);
            changed();
          }}
          className="font-mono"
        />
      </div>

      <div className="mt-2.5" aria-live="polite">
        {accountMatches ? (
          <div className="flex items-center gap-3 rounded-2xl bg-[color:color-mix(in_srgb,#16c784_14%,transparent)] px-3.5 py-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#16c784] text-white">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{account!.accountName}</span>
              <span className="block text-xs text-ink-soft">
                {account!.bankName} {cashout.maskAccountNumber(accountNumber)}
              </span>
            </span>
          </div>
        ) : checking ? (
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <Spinner /> Checking the account…
          </p>
        ) : accountError ? (
          <p className="text-sm text-danger">
            {accountError}{" "}
            <button type="button" className="font-semibold underline" onClick={() => setLookupAgain((n) => n + 1)}>
              Try again
            </button>
          </p>
        ) : (
          <p className="text-[13px] text-ink-faint">Choose the bank and enter the account number. The name on the account shows here to confirm it.</p>
        )}
      </div>

      {viewOnly ? <p className="mt-4 text-sm font-medium text-ink-soft">Preview only: sign in on the live site to cash out.</p> : null}
      {todo && !error ? <p className="mt-4 text-[13px] font-medium text-ink-soft">{todo}</p> : null}
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      <Button className="mt-4 w-full sm:w-auto" disabled={busy !== null || blocked || typed === null || typed <= 0n || todo !== null} onClick={create}>
        {busy === "create" ? <Spinner className="border-on-ink" /> : null}
        {busy === "create" ? "Getting your rate…" : "Continue"}
      </Button>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        Next you confirm it&apos;s you, then see the exact rate. Nothing is sent until you approve it there.
      </p>

      <div className="mt-4 border-t border-[color:var(--glass-border)] pt-3">
        <button type="button" disabled={busy !== null || blocked} onClick={loadRecent} className="text-sm font-medium text-ink-soft hover:underline disabled:opacity-50">
          {busy === "list" ? "Loading…" : recent ? "Refresh recent cash-outs" : "See recent cash-outs"}
        </button>
        {recent ? (
          <div className="mt-2">
            {recent.length === 0 ? (
              <p className="text-sm text-ink-faint">No cash-outs yet.</p>
            ) : (
              recent.slice(0, 8).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setStep({ name: "status", order: o })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-muted"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{formatNgn(o.amountNgn)}</span>
                    <span className="block truncate text-xs text-ink-faint">
                      {o.bankName} {o.accountNumberMasked} · {new Date(o.createdAtMs).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-ink-soft">{STATUS_TEXT[o.status].title}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
