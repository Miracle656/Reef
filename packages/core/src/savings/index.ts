/**
 * USDC savings (#15): transaction builders + read helpers for the
 * `reef_savings` Move package (packages/savings). Testnet uses `mock_yield` as
 * the lender. A real lender (#16) slots in behind {@link SavingsAdapter}.
 *
 * Every builder spends the sender's OWN coins (`useGasCoin: false`), never the
 * sponsor's gas coin, so all of it is gasless under either sponsor.
 */
import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";

export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
/** Lock lengths the frozen on-chain config allows: 1, 3, 6, 12 months. */
export const LOCK_DURATIONS_MS = [1, 3, 6, 12].map((m) => m * MONTH_MS);
export const RATE_SCALE = 1_000_000_000n;
const MS_PER_YEAR = 365n * 24n * 60n * 60n * 1000n;

export interface SavingsDeployment {
  packageId: string;
  /** frozen SavingsConfig */
  configId: string;
  /** shared MockVault<USDC> */
  vaultId: string;
  /** shared BonusPool */
  bonusPoolId: string;
  /** the USDC coin type the config accepts */
  underlyingType: string;
}

/** "12.5" → base units (6 decimals), exact, no floating point. Null if invalid or ≤ 0. */
export function parseAmount(amount: string, decimals = 6): bigint | null {
  const s = amount.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole = "", frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  const units = BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  return units > 0n ? units : null;
}

/** Base units → "12.5" (trailing zeros trimmed). */
export function formatAmount(units: bigint, decimals = 6): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${abs / base}${frac ? `.${frac}` : ""}`;
}

export const receiptType = (d: SavingsDeployment) => `${d.packageId}::mock_yield::MOCK_YIELD`;
export const lockType = (d: SavingsDeployment) => `${d.packageId}::savings::SavingsLock<${d.underlyingType}>`;

/** Targets the sponsor may pay for (append to the allowlist when deployed). */
export function savingsAllowedTargets(packageId: string): string[] {
  return ["deposit_flex", "withdraw_flex", "open_lock", "open_halal_lock", "withdraw_matured", "break_early"].map(
    (f) => `${packageId}::savings::${f}`,
  );
}

const CLOCK = "0x6";

export function buildDepositFlexTx(d: SavingsDeployment, amount: bigint, owner: string): Transaction {
  const tx = new Transaction();
  const coin = tx.add(coinWithBalance({ type: d.underlyingType, balance: amount, useGasCoin: false }));
  const [receipt] = tx.moveCall({
    target: `${d.packageId}::savings::deposit_flex`,
    typeArguments: [d.underlyingType],
    arguments: [tx.object(d.configId), tx.object(d.vaultId), coin, tx.object(CLOCK)],
  });
  tx.transferObjects([receipt!], tx.pure.address(owner));
  return tx;
}

/** Redeem `receipts` (base units of the receipt coin) back to USDC. */
export function buildWithdrawFlexTx(d: SavingsDeployment, receipts: bigint, owner: string): Transaction {
  const tx = new Transaction();
  const receipt = tx.add(coinWithBalance({ type: receiptType(d), balance: receipts, useGasCoin: false }));
  const [out] = tx.moveCall({
    target: `${d.packageId}::savings::withdraw_flex`,
    typeArguments: [d.underlyingType],
    arguments: [tx.object(d.configId), tx.object(d.vaultId), receipt, tx.object(CLOCK)],
  });
  tx.transferObjects([out!], tx.pure.address(owner));
  return tx;
}

export function buildOpenLockTx(
  d: SavingsDeployment,
  p: { amount: bigint; durationMs: number; breakable: boolean; halal?: boolean },
): Transaction {
  const tx = new Transaction();
  const coin = tx.add(coinWithBalance({ type: d.underlyingType, balance: p.amount, useGasCoin: false }));
  if (p.halal) {
    tx.moveCall({
      target: `${d.packageId}::savings::open_halal_lock`,
      typeArguments: [d.underlyingType],
      arguments: [tx.object(d.configId), coin, tx.pure.u64(p.durationMs), tx.pure.bool(p.breakable), tx.object(CLOCK)],
    });
  } else {
    tx.moveCall({
      target: `${d.packageId}::savings::open_lock`,
      typeArguments: [d.underlyingType],
      arguments: [tx.object(d.configId), tx.object(d.vaultId), coin, tx.pure.u64(p.durationMs), tx.pure.bool(p.breakable), tx.object(CLOCK)],
    });
  }
  return tx;
}

/** TESTNET ONLY: mint `amount` of the package's test USDC to `owner`. */
export function buildTestUsdcMintTx(packageId: string, faucetId: string, owner: string, amount: bigint): Transaction {
  const tx = new Transaction();
  const [c] = tx.moveCall({ target: `${packageId}::test_usdc::mint`, arguments: [tx.object(faucetId), tx.pure.u64(amount)] });
  tx.transferObjects([c!], tx.pure.address(owner));
  return tx;
}

export function buildWithdrawMaturedTx(d: SavingsDeployment, lockId: string, owner: string): Transaction {
  const tx = new Transaction();
  const [out] = tx.moveCall({
    target: `${d.packageId}::savings::withdraw_matured`,
    typeArguments: [d.underlyingType],
    arguments: [tx.object(d.configId), tx.object(lockId), tx.object(d.vaultId), tx.object(CLOCK)],
  });
  tx.transferObjects([out!], tx.pure.address(owner));
  return tx;
}

export function buildBreakEarlyTx(d: SavingsDeployment, lockId: string, owner: string): Transaction {
  const tx = new Transaction();
  const [out] = tx.moveCall({
    target: `${d.packageId}::savings::break_early`,
    typeArguments: [d.underlyingType],
    arguments: [tx.object(d.configId), tx.object(lockId), tx.object(d.vaultId), tx.object(d.bonusPoolId), tx.object(CLOCK)],
  });
  tx.transferObjects([out!], tx.pure.address(owner));
  return tx;
}

// ---- reads + the same math the Move code does ----

export interface VaultState {
  /** underlying the vault can pay out now */
  liquidity: bigint;
  receiptSupply: bigint;
  rate: bigint;
  lastMs: bigint;
  aprBps: bigint;
}

const MockVaultBcs = bcs.struct("MockVault", {
  id: bcs.Address,
  underlying: bcs.u64(),
  receipts: bcs.struct("TreasuryCap", { id: bcs.Address, total_supply: bcs.u64() }),
  rate: bcs.u128(),
  last_ms: bcs.u64(),
  apr_bps: bcs.u64(),
});

export async function readVault(client: ClientWithCoreApi, vaultId: string): Promise<VaultState> {
  const { object } = await client.core.getObject({ objectId: vaultId, include: { content: true } });
  const v = MockVaultBcs.parse(object.content!);
  return {
    liquidity: BigInt(v.underlying),
    receiptSupply: BigInt(v.receipts.total_supply),
    rate: BigInt(v.rate),
    lastMs: BigInt(v.last_ms),
    aprBps: BigInt(v.apr_bps),
  };
}

/** Rate at `nowMs`, exactly as `mock_yield::projected_rate` computes it. */
export function projectRate(v: Pick<VaultState, "rate" | "lastMs" | "aprBps">, nowMs: number | bigint): bigint {
  const now = BigInt(nowMs);
  if (now <= v.lastMs) return v.rate;
  return v.rate + (v.rate * v.aprBps * (now - v.lastMs)) / (10_000n * MS_PER_YEAR);
}

/** USDC value of `receipts` at `rate` (rounded down, like Move). */
export function valueOf(receipts: bigint, rate: bigint): bigint {
  return (receipts * rate) / RATE_SCALE;
}

/** Utilisation proxy for the mock: how much of what's owed it can pay now. */
export function coverage(v: VaultState, nowMs: number): number {
  const owed = valueOf(v.receiptSupply, projectRate(v, nowMs));
  return owed === 0n ? 1 : Number((v.liquidity * 10_000n) / owed) / 10_000;
}

/**
 * The break-early rule, mirrored from `savings::break_early`: get back the
 * principal, forfeit the rest. If the rate fell so the receipts are worth less
 * than principal, get back everything and forfeit nothing.
 */
export function breakEarlyPreview(p: { principal: bigint; receipts: bigint; rate: bigint }): {
  returned: bigint;
  forfeitedReceipts: bigint;
  forfeitedValue: bigint;
} {
  const needed = (p.principal * RATE_SCALE + p.rate - 1n) / p.rate;
  if (needed >= p.receipts) return { returned: valueOf(p.receipts, p.rate), forfeitedReceipts: 0n, forfeitedValue: 0n };
  const forfeitedReceipts = p.receipts - needed;
  return { returned: valueOf(needed, p.rate), forfeitedReceipts, forfeitedValue: valueOf(forfeitedReceipts, p.rate) };
}

export interface LockView {
  id: string;
  principal: bigint;
  /** lender receipts held (0 for a Halal lock) */
  receipts: bigint;
  halal: boolean;
  createdMs: number;
  unlockMs: number;
  breakable: boolean;
}

const SavingsLockBcs = bcs.struct("SavingsLock", {
  id: bcs.Address,
  owner: bcs.Address,
  principal: bcs.u64(),
  holding: bcs.enum("Holding", {
    Lender: bcs.struct("Lender", { receipts: bcs.u64() }),
    Halal: bcs.struct("Halal", { funds: bcs.u64() }),
  }),
  created_ms: bcs.u64(),
  unlock_ms: bcs.u64(),
  breakable: bcs.bool(),
});

/** Decode a `SavingsLock<T>` object's BCS content. */
export function parseLock(content: Uint8Array): LockView {
  const l = SavingsLockBcs.parse(content);
  const lender = l.holding.$kind === "Lender";
  return {
    id: l.id,
    principal: BigInt(l.principal),
    receipts: lender ? BigInt(l.holding.Lender!.receipts) : 0n,
    halal: !lender,
    createdMs: Number(l.created_ms),
    unlockMs: Number(l.unlock_ms),
    breakable: l.breakable,
  };
}

/** The owner's open locks, read straight from the chain. */
export async function readLocks(client: ClientWithCoreApi, d: SavingsDeployment, owner: string): Promise<LockView[]> {
  const out: LockView[] = [];
  let cursor: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof client.core.listOwnedObjects<{ content: true }>>> = await client.core.listOwnedObjects({
      owner,
      type: lockType(d),
      include: { content: true },
      cursor,
    });
    for (const o of page.objects) if (o.content) out.push(parseLock(o.content));
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);
  return out.sort((a, b) => a.unlockMs - b.unlockMs);
}

/** Current USDC value of a lock: receipts at the current rate, or the coin itself (Halal). */
export function lockValue(l: LockView, rate: bigint): bigint {
  return l.halal ? l.principal : valueOf(l.receipts, rate);
}

/** Where a real lender plugs in later (Scallop/NAVI/Suilend, see #16). */
export interface SavingsAdapter {
  name: string;
  allowedTargets(): string[];
  /** underlying per receipt, scaled by RATE_SCALE */
  exchangeRate(client: ClientWithCoreApi, nowMs: number): Promise<bigint>;
  /** variable APR in basis points (display only: "variable, not guaranteed") */
  aprBps(client: ClientWithCoreApi): Promise<number>;
}

/** The testnet mock lender behind the adapter interface. */
export function mockYieldAdapter(d: SavingsDeployment): SavingsAdapter {
  return {
    name: "ReeF testnet mock lender",
    allowedTargets: () => savingsAllowedTargets(d.packageId),
    exchangeRate: async (client, nowMs) => projectRate(await readVault(client, d.vaultId), nowMs),
    aprBps: async (client) => Number((await readVault(client, d.vaultId)).aprBps),
  };
}
