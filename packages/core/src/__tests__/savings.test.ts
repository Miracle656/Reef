import { describe, expect, it } from "vitest";
import {
  breakEarlyPreview,
  buildBreakEarlyTx,
  buildDepositFlexTx,
  buildOpenLockTx,
  LOCK_DURATIONS_MS,
  MONTH_MS,
  projectRate,
  RATE_SCALE,
  savingsAllowedTargets,
  valueOf,
  type SavingsDeployment,
} from "../savings/index";

const USD = 1_000_000n;
const YEAR = 365n * 24n * 60n * 60n * 1000n;
const d: SavingsDeployment = {
  packageId: "0x" + "5".repeat(64),
  configId: "0x" + "c".repeat(64),
  vaultId: "0x" + "d".repeat(64),
  bonusPoolId: "0x" + "e".repeat(64),
  underlyingType: "0xabc::usdc::USDC",
};
const calls = (tx: ReturnType<typeof buildDepositFlexTx>) =>
  tx.getData().commands.flatMap((c) => (c.$kind === "MoveCall" ? [`${c.MoveCall.module}::${c.MoveCall.function}`] : []));

describe("savings math (mirrors the Move code)", () => {
  it("projects the rate like mock_yield: 10% APR for a year = 1.1", () => {
    const v = { rate: RATE_SCALE, lastMs: 0n, aprBps: 1_000n };
    expect(projectRate(v, YEAR)).toBe(1_100_000_000n);
    expect(projectRate(v, 0)).toBe(RATE_SCALE);
    expect(valueOf(100n * USD, projectRate(v, YEAR))).toBe(110n * USD);
  });

  it("break early: principal back, the yield forfeited", () => {
    const rate = 1_050_000_000n; // receipts are worth 5% more than at deposit
    const p = breakEarlyPreview({ principal: 100n * USD, receipts: 100n * USD, rate });
    expect(p.returned).toBe(100n * USD); // exactly the principal (rounded up, never short)
    expect(p.forfeitedValue).toBeGreaterThan(4n * USD);
    expect(p.forfeitedValue).toBeLessThan(5n * USD + 1n);
  });

  it("break early after the rate FELL: everything back, nothing forfeited", () => {
    const p = breakEarlyPreview({ principal: 100n * USD, receipts: 100n * USD, rate: 800_000_000n });
    expect(p.returned).toBe(80n * USD);
    expect(p.forfeitedReceipts).toBe(0n);
  });
});

describe("savings tx builders", () => {
  it("flex deposit spends the user's USDC and sends the receipt back to them", () => {
    const tx = buildDepositFlexTx(d, 10n * USD, "0x1");
    expect(calls(tx)).toEqual(["savings::deposit_flex"]);
    expect(tx.getData().commands.at(-1)?.$kind).toBe("TransferObjects");
    expect(JSON.stringify(tx.getData().commands, (_k, v) => (typeof v === "bigint" ? `${v}` : v))).not.toMatch(/GasCoin/);
  });

  it("lock vs halal lock pick the right entry point", () => {
    expect(calls(buildOpenLockTx(d, { amount: USD, durationMs: 3 * MONTH_MS, breakable: true }))).toEqual(["savings::open_lock"]);
    expect(calls(buildOpenLockTx(d, { amount: USD, durationMs: 3 * MONTH_MS, breakable: true, halal: true }))).toEqual([
      "savings::open_halal_lock",
    ]);
    expect(calls(buildBreakEarlyTx(d, "0x" + "f".repeat(64), "0x1"))).toEqual(["savings::break_early"]);
  });

  it("allow-lists exactly the six savings entry points", () => {
    expect(savingsAllowedTargets(d.packageId)).toHaveLength(6);
    expect(LOCK_DURATIONS_MS).toEqual([1, 3, 6, 12].map((m) => m * MONTH_MS));
  });
});
