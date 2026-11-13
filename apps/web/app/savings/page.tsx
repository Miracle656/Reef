"use client";

/**
 * USDC savings (#15): Flex + Lock (1/3/6/12 months) + 0% Halal lock.
 * Non-custodial: positions are read straight from the chain (the receipt coin
 * the user holds, the SavingsLock objects they own); the indexer only adds the
 * yearly statement. Copy rules from the research: the rate is variable, savings
 * are not insured, and we never say "interest", "guaranteed" or "risk-free".
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { savings } from "@umbra/core";
import { AppShell } from "@/components/app-shell";
import { Landing } from "@/components/landing";
import { toast } from "@/components/toaster";
import { Button, Card, Spinner } from "@/components/ui";
import { useSocialAccount } from "@/lib/account";
import { NETWORK, NGN_PER_USD, SAVINGS } from "@/lib/config";
import { useGasless } from "@/lib/gasless";
import { useChainClient } from "@/lib/sui-client";
import { trpc } from "@/lib/trpc";

const DEC = 6;
const usd = (units: bigint, places = 2) => {
  const [w, f = ""] = savings.formatAmount(units, DEC).split(".");
  return `$${w}${places ? `.${f.padEnd(places, "0").slice(0, places)}` : ""}`;
};
const naira = (units: bigint) =>
  NGN_PER_USD ? `≈ ₦${Math.round((Number(units) / 1e6) * NGN_PER_USD).toLocaleString()}` : null;
const MONTHS = [1, 3, 6, 12];

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export default function SavingsPage() {
  const account = useSocialAccount();
  if (!account) return <Landing />;
  if (!SAVINGS) {
    return (
      <AppShell title="Savings">
        <Card className="p-5 text-sm text-ink-soft">Savings isn&apos;t set up on this deployment yet.</Card>
      </AppShell>
    );
  }
  return <Savings owner={account.address} d={SAVINGS} />;
}

type Sheet = { kind: "add" | "withdraw" | "lock" } | { kind: "break"; lock: savings.LockView } | null;

function Savings({ owner, d }: { owner: string; d: savings.SavingsDeployment & { faucetId?: string } }) {
  const client = useChainClient();
  const run = useGasless();
  const qc = useQueryClient();
  const now = useNow();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const ackKey = `reef:savings:ack:${owner}`;
  const [acked, setAcked] = useState(true);
  useEffect(() => {
    try {
      setAcked(localStorage.getItem(ackKey) === "1");
    } catch {
      setAcked(false);
    }
  }, [ackKey]);

  const q = useQuery({
    queryKey: ["savings", owner],
    queryFn: async () => {
      const bal = async (coinType: string) => BigInt((await client.core.getBalance({ owner, coinType })).balance.balance);
      const [vault, locks, receipts, wallet] = await Promise.all([
        savings.readVault(client, d.vaultId),
        savings.readLocks(client, d, owner),
        bal(savings.receiptType(d)),
        bal(d.underlyingType),
      ]);
      return { vault, locks, receipts, wallet };
    },
    refetchInterval: 20_000,
  });
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const statement = useQuery({
    queryKey: ["savings-statement", owner, yearStart],
    queryFn: () => trpc.savingsStatement.query({ owner, fromMs: yearStart }),
  });

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["savings", owner] }), qc.invalidateQueries({ queryKey: ["savings-statement", owner] })]);
  async function act(label: string, tx: Parameters<typeof run>[0], done: string) {
    setBusy(label);
    try {
      const { digest } = await run(tx);
      await client.core.waitForTransaction({ digest });
      toast(done);
      setSheet(null);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading || !q.data) {
    return (
      <AppShell title="Savings">
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Spinner /> Loading your savings…
        </div>
      </AppShell>
    );
  }
  const { vault, locks, receipts, wallet } = q.data;
  const rate = savings.projectRate(vault, now);
  const flex = savings.valueOf(receipts, rate);
  const locked = locks.reduce((sum, l) => sum + savings.lockValue(l, rate), 0n);
  const total = flex + locked;
  const apr = Number(vault.aprBps) / 100;

  return (
    <AppShell title="Savings">
      {!acked ? <RiskGate onAccept={() => { try { localStorage.setItem(ackKey, "1"); } catch { /* private mode */ } setAcked(true); }} /> : null}

      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Total saved</p>
        <p className="mt-1 text-4xl font-black tabular-nums tracking-tight">{usd(total, 6)}</p>
        {naira(total) ? <p className="text-sm text-ink-soft">{naira(total)}</p> : null}
        <p className="mt-3 text-[13px] text-ink-soft">
          Variable rate, about <b>{apr.toFixed(2)}% a year</b> right now. It can go up or down, and it isn&apos;t guaranteed.
          Savings are not insured.
          {NETWORK !== "mainnet" ? <span className="ml-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px]">testnet mock lender</span> : null}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-soft">In your wallet: {usd(wallet)} USDC</span>
          {d.faucetId && NETWORK !== "mainnet" ? (
            <Button size="sm" variant="outline" disabled={busy != null} onClick={() => void act("faucet", savings.buildTestUsdcMintTx(d.packageId, d.faucetId!, owner, 100_000_000n), "Got 100 test USDC")}>
              {busy === "faucet" ? <Spinner /> : null} Get 100 test USDC
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Flex</h2>
            <p className="text-sm text-ink-soft">Add or take out any time the market has cash available.</p>
          </div>
          <p className="text-xl font-bold tabular-nums">{usd(flex, 6)}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={!acked || busy != null} onClick={() => setSheet({ kind: "add" })}>Add</Button>
          <Button size="sm" variant="outline" disabled={receipts === 0n || busy != null} onClick={() => setSheet({ kind: "withdraw" })}>
            Take out
          </Button>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Locks</h2>
            <p className="text-sm text-ink-soft">Save with discipline: your money stays put until the date you pick.</p>
          </div>
          <Button size="sm" disabled={!acked || busy != null} onClick={() => setSheet({ kind: "lock" })}>New lock</Button>
        </div>
        {locks.length === 0 ? <p className="mt-3 text-sm text-ink-faint">No locks yet.</p> : null}
        <div className="mt-3 space-y-2">
          {locks.map((l) => {
            const value = savings.lockValue(l, rate);
            const matured = now >= l.unlockMs;
            const pct = Math.min(100, Math.max(0, ((now - l.createdMs) / (l.unlockMs - l.createdMs)) * 100));
            return (
              <div key={l.id} className="rounded-2xl border border-[color:var(--glass-border)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {usd(l.principal)} {l.halal ? "· Halal (0%)" : ""} {!l.breakable ? "· can't break early" : ""}
                  </span>
                  <span className="text-sm tabular-nums">{usd(value, 6)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[12.5px] text-ink-faint">
                  <span>{matured ? "Unlocked" : `Unlocks ${new Date(l.unlockMs).toLocaleDateString()}`}</span>
                  {matured ? (
                    <button disabled={busy != null} onClick={() => void act(l.id, savings.buildWithdrawMaturedTx(d, l.id, owner), "Withdrawn to your wallet")} className="font-semibold text-accent hover:underline">
                      {busy === l.id ? "Withdrawing…" : "Withdraw"}
                    </button>
                  ) : l.breakable ? (
                    <button disabled={busy != null} onClick={() => setSheet({ kind: "break", lock: l })} className="font-medium text-danger hover:underline">
                      Break early
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {statement.data ? (
        <Card className="mt-4 p-5 text-sm">
          <h2 className="font-bold">This year</h2>
          <p className="mt-1 text-ink-soft">
            Earned and taken out: <b className="text-ink">{usd(BigInt(statement.data.realized), 6)}</b> · put in {usd(BigInt(statement.data.deposited))} ·
            taken out {usd(BigInt(statement.data.withdrawn))}
          </p>
          <p className="mt-1 text-[12px] text-ink-faint">For your records: savings gains count as income in Nigeria from 2026.</p>
        </Card>
      ) : null}

      {sheet?.kind === "add" ? (
        <AmountSheet title="Add to Flex" max={wallet} busy={busy === "add"} onClose={() => setSheet(null)}
          onSubmit={(amt) => void act("add", savings.buildDepositFlexTx(d, amt, owner), "Added to Flex")} />
      ) : null}
      {sheet?.kind === "withdraw" ? (
        <WithdrawSheet receipts={receipts} rate={rate} busy={busy === "withdraw"} onClose={() => setSheet(null)}
          onSubmit={(r) => void act("withdraw", savings.buildWithdrawFlexTx(d, r, owner), "Sent to your wallet")} />
      ) : null}
      {sheet?.kind === "lock" ? (
        <LockSheet max={wallet} busy={busy === "lock"} onClose={() => setSheet(null)}
          onSubmit={(p) => void act("lock", savings.buildOpenLockTx(d, p), p.halal ? "Halal lock created" : "Lock created")} />
      ) : null}
      {sheet?.kind === "break" ? (
        <BreakSheet lock={sheet.lock} rate={rate} busy={busy === "break"} onClose={() => setSheet(null)}
          onConfirm={() => void act("break", savings.buildBreakEarlyTx(d, sheet.lock.id, owner), "Lock broken; principal sent to your wallet")} />
      ) : null}
    </AppShell>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-ink/40 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-[color:var(--glass-border)] bg-surface p-5 shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const inputCls =
  "h-12 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 text-[17px] font-semibold outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]";

function AmountSheet({ title, max, busy, onClose, onSubmit }: { title: string; max: bigint; busy: boolean; onClose: () => void; onSubmit: (amount: bigint) => void }) {
  const [v, setV] = useState("");
  const amt = savings.parseAmount(v, DEC);
  const over = amt != null && amt > max;
  return (
    <Modal title={title} onClose={onClose}>
      <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(",", "."))} placeholder="Amount in USDC" aria-label="Amount" className={inputCls} />
      <p className="mt-1 text-[12.5px] text-ink-faint">Available {usd(max)}</p>
      {over ? <p className="mt-1 text-sm text-danger">That&apos;s more than you have.</p> : null}
      <Button className="mt-4 w-full" disabled={!amt || over || busy} onClick={() => amt && onSubmit(amt)}>
        {busy ? <Spinner className="border-on-ink" /> : null} Confirm
      </Button>
    </Modal>
  );
}

function WithdrawSheet({ receipts, rate, busy, onClose, onSubmit }: { receipts: bigint; rate: bigint; busy: boolean; onClose: () => void; onSubmit: (receipts: bigint) => void }) {
  const total = savings.valueOf(receipts, rate);
  const [v, setV] = useState("");
  const amt = savings.parseAmount(v, DEC);
  // USDC wanted → receipts to burn (rounded up), capped at what's held
  const need = amt ? (amt * savings.RATE_SCALE + rate - 1n) / rate : null;
  const r = need != null ? (need > receipts ? null : need) : null;
  return (
    <Modal title="Take out of Flex" onClose={onClose}>
      <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(",", "."))} placeholder="Amount in USDC" aria-label="Amount" className={inputCls} />
      <button className="mt-1 text-[12.5px] font-semibold text-accent" onClick={() => setV(savings.formatAmount(total, DEC))}>Take out everything ({usd(total, 6)})</button>
      {amt && r == null ? <p className="mt-1 text-sm text-danger">That&apos;s more than you have in Flex.</p> : null}
      <p className="mt-2 text-[12.5px] text-ink-faint">If the market is short of cash right now, this can fail. Try a smaller amount or later.</p>
      <Button className="mt-4 w-full" disabled={r == null || busy} onClick={() => r != null && onSubmit(v === savings.formatAmount(total, DEC) ? receipts : r)}>
        {busy ? <Spinner className="border-on-ink" /> : null} Take out
      </Button>
    </Modal>
  );
}

function LockSheet({ max, busy, onClose, onSubmit }: { max: bigint; busy: boolean; onClose: () => void; onSubmit: (p: { amount: bigint; durationMs: number; breakable: boolean; halal: boolean }) => void }) {
  const [v, setV] = useState("");
  const [months, setMonths] = useState(3);
  const [halal, setHalal] = useState(false);
  const [breakable, setBreakable] = useState(true);
  const amt = savings.parseAmount(v, DEC);
  const over = amt != null && amt > max;
  const unlock = new Date(Date.now() + months * savings.MONTH_MS).toLocaleDateString();
  return (
    <Modal title="New lock" onClose={onClose}>
      <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(",", "."))} placeholder="Amount in USDC" aria-label="Amount" className={inputCls} />
      <p className="mt-1 text-[12.5px] text-ink-faint">Available {usd(max)}</p>
      <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Lock length">
        {MONTHS.map((m) => (
          <button key={m} role="radio" aria-checked={m === months} onClick={() => setMonths(m)}
            className={`h-9 flex-1 rounded-full text-[14px] font-semibold ${m === months ? "bg-accent text-on-accent" : "border border-[color:var(--glass-border)] text-ink-soft"}`}>
            {m} mo
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-start gap-2 text-[14px]">
        <input type="checkbox" checked={halal} onChange={(e) => setHalal(e.target.checked)} className="mt-1 h-4 w-4 accent-[color:var(--accent)]" />
        <span>Halal lock (0%): your money is held as-is and never lent out, so it earns nothing.</span>
      </label>
      <label className="mt-2 flex items-start gap-2 text-[14px]">
        <input type="checkbox" checked={!breakable} onChange={(e) => setBreakable(!e.target.checked)} className="mt-1 h-4 w-4 accent-[color:var(--accent)]" />
        <span>No breaking early. Nobody, including ReeF, can unlock it before {unlock}.</span>
      </label>
      <p className="mt-3 text-[12.5px] text-ink-faint">
        Unlocks {unlock}. {halal ? "" : "Earns the same variable rate as Flex. "}
        {breakable ? "If you break it early you get your money back but give up what it earned." : ""}
      </p>
      {over ? <p className="mt-1 text-sm text-danger">That&apos;s more than you have.</p> : null}
      <Button className="mt-4 w-full" disabled={!amt || over || busy} onClick={() => amt && onSubmit({ amount: amt, durationMs: months * savings.MONTH_MS, breakable, halal })}>
        {busy ? <Spinner className="border-on-ink" /> : null} Lock {amt ? usd(amt) : ""}
      </Button>
    </Modal>
  );
}

function BreakSheet({ lock, rate, busy, onClose, onConfirm }: { lock: savings.LockView; rate: bigint; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const p = lock.halal
    ? { returned: lock.principal, forfeitedValue: 0n }
    : savings.breakEarlyPreview({ principal: lock.principal, receipts: lock.receipts, rate });
  return (
    <Modal title="Break this lock early?" onClose={onClose}>
      <p className="text-[15px]">
        You get back <b>{usd(p.returned, 6)}</b>
        {p.forfeitedValue > 0n ? (
          <>
            {" "}and give up <b>{usd(p.forfeitedValue, 6)}</b> it earned.
          </>
        ) : (
          "."
        )}
      </p>
      {p.returned < lock.principal ? (
        <p className="mt-2 text-sm text-danger">The lender&apos;s rate has fallen, so this is less than you put in.</p>
      ) : null}
      {p.forfeitedValue > 0n ? (
        <p className="mt-2 text-[12.5px] text-ink-faint">What you give up goes to a pool for people who keep their locks to the end, not to ReeF.</p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Keep it locked</Button>
        <Button className="flex-1" disabled={busy} onClick={onConfirm}>
          {busy ? <Spinner className="border-on-ink" /> : null} Break it
        </Button>
      </div>
    </Modal>
  );
}

function RiskGate({ onAccept }: { onAccept: () => void }) {
  const items = [
    "The rate changes with the market. It can go down, and it isn't guaranteed.",
    "Savings are not insured. If the lender loses money, I can get back less than I put in.",
    "Taking money out depends on the market having cash available at that moment.",
  ];
  const [checked, setChecked] = useState(items.map(() => false));
  return (
    <Card className="mb-4 border-accent/40 p-5">
      <h2 className="font-bold">Before you save</h2>
      <div className="mt-2 space-y-2">
        {items.map((t, i) => (
          <label key={i} className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" checked={checked[i]} onChange={(e) => setChecked((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} className="mt-1 h-4 w-4 accent-[color:var(--accent)]" />
            <span>{t}</span>
          </label>
        ))}
      </div>
      <Button className="mt-3" disabled={!checked.every(Boolean)} onClick={onAccept}>I understand</Button>
      <p className="mt-2 text-[12px] text-ink-faint">
        ReeF never holds your money: you hold the lender&apos;s receipt or your own lock, and ReeF can&apos;t move either.
      </p>
    </Card>
  );
}
