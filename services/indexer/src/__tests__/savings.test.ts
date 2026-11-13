import { describe, expect, it } from "vitest";
import { normalizeSavingsEvent, savingsStatement, type SavingsEventRow } from "../indexer/savings";

const PKG = "0x3466";
const meta = (seq: number, ms = 1_000) => ({ digest: "D1", sequenceNumber: seq, timestampMs: ms });

describe("savings event normalization", () => {
  it("parses savings events (real testnet JSON shape) and keys them by digest:seq", () => {
    const e = normalizeSavingsEvent(`${PKG}::savings::FlexDeposited`, { owner: "0xabc", amount: "40000000", receipts: "39999998" }, meta(1));
    expect(e).toMatchObject({ id: "D1:1", owner: "0xabc", kind: "flex_deposit", amount: 40_000_000n, receipts: 39_999_998n });
    const open = normalizeSavingsEvent(
      `${PKG}::savings::LockOpened`,
      { lock_id: "0xL", owner: "0xabc", principal: "50000000", receipts: "49999998", unlock_ms: "99", breakable: true, halal: false },
      meta(2),
    );
    expect(open).toMatchObject({ kind: "lock_open", lockId: "0xL", amount: 50_000_000n, lock: { unlockMs: 99n, breakable: true, halal: false } });
    const broke = normalizeSavingsEvent(`${PKG}::savings::LockBroken`, { lock_id: "0xL", owner: "0xabc", returned: "49999999", forfeited_receipts: "7" }, meta(3));
    expect(broke).toMatchObject({ kind: "lock_break", amount: 49_999_999n, forfeited: 7n });
  });

  it("ignores the lender's own events and unknown names", () => {
    expect(normalizeSavingsEvent(`${PKG}::mock_yield::Deposited`, { amount: "1" }, meta(0))).toBeNull();
    expect(normalizeSavingsEvent(`${PKG}::savings::Something`, {}, meta(0))).toBeNull();
  });
});

const ev = (kind: SavingsEventRow["kind"], amount: bigint, receipts = 0n, lockId: string | null = null, t = 1n, forfeited = 0n) => ({
  kind,
  amount,
  receipts,
  lockId,
  forfeited,
  timestampMs: t,
});
const USD = 1_000_000n;

describe("savings statement (realized yield)", () => {
  it("Flex gains use average cost: withdrawing half realizes half the gain", () => {
    const s = savingsStatement([
      ev("flex_deposit", 100n * USD, 100n * USD),
      ev("flex_withdraw", 55n * USD, 50n * USD), // half the receipts, now worth 55
    ]);
    expect(s.realizedFlex).toBe(`${5n * USD}`);
    expect(s.deposited).toBe(`${100n * USD}`);
    expect(s.withdrawn).toBe(`${55n * USD}`);
  });

  it("a matured lock realizes returned − principal; a broken one ~0 and records the forfeit", () => {
    const s = savingsStatement([
      ev("lock_open", 50n * USD, 50n * USD, "A"),
      ev("lock_open", 20n * USD, 20n * USD, "B"),
      ev("lock_withdraw", 52n * USD, 0n, "A"),
      ev("lock_break", 20n * USD, 0n, "B", 1n, 9n),
    ]);
    expect(s.realizedLocks).toBe(`${2n * USD}`);
    expect(s.forfeitedReceipts).toBe("9");
  });

  it("a lender loss shows as a negative gain, not hidden", () => {
    const s = savingsStatement([ev("lock_open", 100n * USD, 100n * USD, "A"), ev("lock_break", 80n * USD, 0n, "A")]);
    expect(s.realized).toBe(`${-20n * USD}`);
  });

  it("a period filter keeps the average cost from before the period", () => {
    const s = savingsStatement(
      [ev("flex_deposit", 100n * USD, 100n * USD, null, 1n), ev("flex_withdraw", 110n * USD, 100n * USD, null, 10n)],
      5n,
      20n,
    );
    expect(s.deposited).toBe("0"); // the deposit was before the period
    expect(s.realizedFlex).toBe(`${10n * USD}`); // but its cost basis still counts
    expect(s.events).toBe(1);
  });
});
