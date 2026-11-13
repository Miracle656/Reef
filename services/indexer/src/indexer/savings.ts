/**
 * USDC savings ingestion (#15): `reef_savings::savings` events → a ledger +
 * lock rows, and per-user yield statements (gains are taxable income in
 * Nigeria from 1 Jan 2026, so users need a statement from day one).
 *
 * Every row is keyed by tx digest + event sequence, so replays are no-ops.
 */
import type { PrismaClient } from "@prisma/client";

export type SavingsKind = "flex_deposit" | "flex_withdraw" | "lock_open" | "lock_withdraw" | "lock_break";

export interface SavingsEventRow {
  id: string;
  owner: string;
  kind: SavingsKind;
  amount: bigint;
  receipts: bigint;
  lockId: string | null;
  forfeited: bigint;
  timestampMs: bigint;
  digest: string;
  /** lock_open only */
  lock?: { unlockMs: bigint; breakable: boolean; halal: boolean };
}

export interface SavingsEventMeta {
  digest: string;
  sequenceNumber: number;
  timestampMs: number;
}

type Json = Record<string, unknown>;
const big = (v: unknown) => BigInt(String(v ?? 0));
const str = (v: unknown) => String(v ?? "");

/** Parse one event; null for events that aren't savings events (e.g. the lender's). */
export function normalizeSavingsEvent(typeRepr: string, json: unknown, meta: SavingsEventMeta): SavingsEventRow | null {
  const [, mod, name] = typeRepr.split("::");
  if (mod !== "savings" || !json || typeof json !== "object") return null;
  const j = json as Json;
  const base = {
    id: `${meta.digest}:${meta.sequenceNumber}`,
    owner: str(j.owner),
    timestampMs: BigInt(meta.timestampMs),
    digest: meta.digest,
    forfeited: 0n,
    lockId: null as string | null,
  };
  switch (name) {
    case "FlexDeposited":
      return { ...base, kind: "flex_deposit", amount: big(j.amount), receipts: big(j.receipts) };
    case "FlexWithdrawn":
      return { ...base, kind: "flex_withdraw", amount: big(j.amount), receipts: big(j.receipts) };
    case "LockOpened":
      return {
        ...base,
        kind: "lock_open",
        lockId: str(j.lock_id),
        amount: big(j.principal),
        receipts: big(j.receipts),
        lock: { unlockMs: big(j.unlock_ms), breakable: Boolean(j.breakable), halal: Boolean(j.halal) },
      };
    case "LockWithdrawn":
      return { ...base, kind: "lock_withdraw", lockId: str(j.lock_id), amount: big(j.amount), receipts: 0n };
    case "LockBroken":
      return { ...base, kind: "lock_break", lockId: str(j.lock_id), amount: big(j.returned), receipts: 0n, forfeited: big(j.forfeited_receipts) };
    default:
      return null;
  }
}

export async function applySavingsEvent(prisma: PrismaClient, e: SavingsEventRow): Promise<void> {
  const { lock, ...row } = e;
  await prisma.savingsEvent.upsert({ where: { id: e.id }, create: row, update: {} });
  if (e.kind === "lock_open" && e.lockId && lock) {
    await prisma.savingsLock.upsert({
      where: { lockId: e.lockId },
      create: {
        lockId: e.lockId,
        owner: e.owner,
        principal: e.amount,
        receipts: e.receipts,
        unlockMs: lock.unlockMs,
        breakable: lock.breakable,
        halal: lock.halal,
        openedMs: e.timestampMs,
      },
      update: {},
    });
  } else if ((e.kind === "lock_withdraw" || e.kind === "lock_break") && e.lockId) {
    await prisma.savingsLock.updateMany({
      where: { lockId: e.lockId },
      data: { status: e.kind === "lock_break" ? "broken" : "withdrawn", returned: e.amount, closedMs: e.timestampMs },
    });
  }
}

export interface SavingsStatement {
  /** USDC base units, as decimal strings (JSON-safe) */
  deposited: string;
  withdrawn: string;
  /** realized gain (can be negative after a lender loss) */
  realizedFlex: string;
  realizedLocks: string;
  realized: string;
  /** receipts forfeited by breaking locks early */
  forfeitedReceipts: string;
  events: number;
}

/**
 * Realized yield from an owner's events, oldest first. Flex uses average cost
 * (a withdrawal of k of n receipts realizes amountOut − basis·k/n); a closed
 * lock realizes returned − principal. Pass the whole history and filter by
 * time with `fromMs/toMs`, so the average cost carries in from before the period.
 */
export function savingsStatement(
  events: Pick<SavingsEventRow, "kind" | "amount" | "receipts" | "lockId" | "forfeited" | "timestampMs">[],
  fromMs = 0n,
  toMs = BigInt(Number.MAX_SAFE_INTEGER),
): SavingsStatement {
  let receipts = 0n;
  let basis = 0n;
  let deposited = 0n;
  let withdrawn = 0n;
  let realizedFlex = 0n;
  let realizedLocks = 0n;
  let forfeited = 0n;
  let count = 0;
  const principal = new Map<string, bigint>();
  for (const e of events) {
    const inPeriod = e.timestampMs >= fromMs && e.timestampMs <= toMs;
    switch (e.kind) {
      case "flex_deposit":
        receipts += e.receipts;
        basis += e.amount;
        if (inPeriod) deposited += e.amount;
        break;
      case "flex_withdraw": {
        const cost = receipts > 0n ? (basis * e.receipts) / receipts : 0n;
        receipts -= e.receipts;
        basis -= cost;
        if (inPeriod) {
          withdrawn += e.amount;
          realizedFlex += e.amount - cost;
        }
        break;
      }
      case "lock_open":
        if (e.lockId) principal.set(e.lockId, e.amount);
        if (inPeriod) deposited += e.amount;
        break;
      case "lock_withdraw":
      case "lock_break":
        if (inPeriod) {
          withdrawn += e.amount;
          realizedLocks += e.amount - (principal.get(e.lockId ?? "") ?? e.amount);
          forfeited += e.forfeited;
        }
        break;
    }
    if (inPeriod) count++;
  }
  return {
    deposited: `${deposited}`,
    withdrawn: `${withdrawn}`,
    realizedFlex: `${realizedFlex}`,
    realizedLocks: `${realizedLocks}`,
    realized: `${realizedFlex + realizedLocks}`,
    forfeitedReceipts: `${forfeited}`,
    events: count,
  };
}
