import { describe, expect, it } from "vitest";
import { cashout } from "../index";

const OWNER = "0x" + "a".repeat(64);
const ORDER = "3f7c1b2a-84e9-4c11-b3d2-0a9f7e123456";
const text = (m: cashout.CashoutMessage) => new TextDecoder().decode(cashout.canonicalCashoutBytes(m));

describe("coins and banks", () => {
  it("maps wallet symbols to Linq's coin names", () => {
    expect(cashout.cashoutCoinFor("USDC")).toBe("usdc");
    expect(cashout.cashoutCoinFor("USDSUI")).toBe("usdsui");
    expect(cashout.cashoutCoinFor("SUI")).toBeNull();
  });

  it("lists only banks from Linq's guide, with unique numeric codes", () => {
    expect(cashout.BANKS.length).toBe(15);
    expect(new Set(cashout.BANKS.map((b) => b.code)).size).toBe(15);
    for (const b of cashout.BANKS) expect(b.code).toMatch(/^\d{3,6}$/);
    // spot-check against the guide
    expect(cashout.BANKS.find((b) => b.name === "UBA")?.code).toBe("033");
    expect(cashout.BANKS.find((b) => b.name === "OPay")?.code).toBe("100004");
    expect(cashout.BANKS.find((b) => b.name === "GTBank")?.code).toBe("058");
  });

  it("checks and masks account numbers", () => {
    expect(cashout.isAccountNumber("1234567890")).toBe(true);
    for (const bad of ["123456789", "12345678901", "12345 7890", "abcdefghij", ""]) expect(cashout.isAccountNumber(bad)).toBe(false);
    expect(cashout.maskAccountNumber("1234567890")).toBe("******7890");
  });
});

describe("normalizeLinqStatus", () => {
  it("maps every status in Linq's guide", () => {
    expect(cashout.normalizeLinqStatus("initiated")).toBe("awaiting_deposit");
    // still only WATCHING for the deposit, despite the word "processing"
    expect(cashout.normalizeLinqStatus("processing: wallet worker on it..")).toBe("awaiting_deposit");
    expect(cashout.normalizeLinqStatus("processing: in bank queue")).toBe("processing");
    expect(cashout.normalizeLinqStatus("disbursed")).toBe("paid");
    expect(cashout.normalizeLinqStatus("Settled in treasury")).toBe("paid");
    expect(cashout.normalizeLinqStatus("timeout: no deposit received")).toBe("expired");
    expect(cashout.normalizeLinqStatus("failed")).toBe("failed");
  });

  it("returns null for text it doesn't know, rather than guessing", () => {
    for (const s of ["", "complete", "success", "delivered", "refunded"]) expect(cashout.normalizeLinqStatus(s)).toBeNull();
  });

  it("knows which statuses are final", () => {
    expect(["paid", "failed", "expired"].every((s) => cashout.isTerminal(s as cashout.CashoutStatus))).toBe(true);
    expect(cashout.isTerminal("awaiting_deposit")).toBe(false);
    expect(cashout.isTerminal("processing")).toBe(false);
  });
});

describe("signed messages", () => {
  const create: cashout.CashoutMessage = {
    action: "create",
    owner: OWNER,
    orderId: ORDER,
    coin: "usdc",
    amountKind: "ngn",
    amount: "2000.50",
    bankCode: "033",
    accountNumber: "1234567890",
    timestamp: 1_800_000_000_000,
  };

  it("puts every field of every action into the signed bytes", () => {
    expect(text(create)).toBe(`reef:cashout:create:${OWNER}:${ORDER}:usdc:ngn:2000.50:033:1234567890:1800000000000`);
    expect(text({ action: "verify-bank", owner: OWNER, bankCode: "058", accountNumber: "0123456789", timestamp: 5 })).toBe(
      `reef:cashout:verify-bank:${OWNER}:058:0123456789:5`,
    );
    expect(text({ action: "deposit", owner: OWNER, orderId: ORDER, digest: "9UaN13guxdbdKgTEe6KGLYMd2RPQQDETFEvx4PFrogL5", timestamp: 6 })).toBe(
      `reef:cashout:deposit:${OWNER}:${ORDER}:9UaN13guxdbdKgTEe6KGLYMd2RPQQDETFEvx4PFrogL5:6`,
    );
    expect(text({ action: "get", owner: OWNER, orderId: ORDER, timestamp: 7 })).toBe(`reef:cashout:get:${OWNER}:${ORDER}:7`);
    expect(text({ action: "list", owner: OWNER, timestamp: 8 })).toBe(`reef:cashout:list:${OWNER}::8`);
  });

  it("gives different bytes when any signed field changes", () => {
    const base = text(create);
    const variants: cashout.CashoutMessage[] = [
      { ...create, amount: "2000.51" },
      { ...create, amountKind: "stable" },
      { ...create, coin: "usdsui" },
      { ...create, accountNumber: "1234567891" },
      { ...create, bankCode: "058" },
      { ...create, orderId: "3f7c1b2a-84e9-4c11-b3d2-0a9f7e123457" },
      { ...create, owner: "0x" + "b".repeat(64) },
      { ...create, timestamp: create.timestamp + 1 },
    ];
    const seen = new Set([base, ...variants.map(text)]);
    expect(seen.size).toBe(variants.length + 1);
  });

  it("accepts a well-formed request", () => {
    expect(cashout.SignedCashoutSchema.safeParse({ message: create, signature: "sig" }).success).toBe(true);
  });

  it("refuses fields that could smuggle a ':' or change meaning", () => {
    const bad: Record<string, unknown>[] = [
      { ...create, owner: "0x2" }, // short address
      { ...create, owner: "0x" + "A".repeat(64) }, // not lower-case
      { ...create, amount: "2000.505" }, // more than 2 decimals
      { ...create, amount: "-5" },
      { ...create, amount: "1e3" },
      { ...create, amount: "5:1" },
      { ...create, accountNumber: "123456789" },
      { ...create, bankCode: "03:3" },
      { ...create, orderId: "not-a-uuid" },
      { ...create, coin: "sui" },
      { ...create, amountKind: "usd" },
      { ...create, timestamp: 1.5 },
      { ...create, action: "refund" },
    ];
    for (const message of bad) expect(cashout.SignedCashoutSchema.safeParse({ message, signature: "sig" }).success, JSON.stringify(message)).toBe(false);
    expect(cashout.SignedCashoutSchema.safeParse({ message: create, signature: "" }).success).toBe(false);
    expect(cashout.SignedCashoutSchema.safeParse({ message: create }).success).toBe(false);
  });
});

describe("amount arithmetic (integers only)", () => {
  it("parses and prints hundredths", () => {
    expect(cashout.toHundredths("2000")).toBe(200_000n);
    expect(cashout.toHundredths("2000.5")).toBe(200_050n);
    expect(cashout.toHundredths("0.01")).toBe(1n);
    expect(cashout.fromHundredths(200_050n)).toBe("2000.50");
    expect(cashout.fromHundredths(1n)).toBe("0.01");
    expect(cashout.fromHundredths(0n)).toBe("0.00");
    for (const bad of ["", "1.234", "abc", "-1", "1,000"]) expect(() => cashout.toHundredths(bad), bad).toThrow();
  });

  it("rounds the dollars UP to the cent, as Linq does, so a payout is never short", () => {
    // Linq's own example: 2000 naira at 1655 -> ceil(1.2084…) = 1.21. (Its guide prints 1.22 for rate 1639.34.)
    expect(cashout.centsForNgn(200_000n, 1655)).toBe(121n);
    expect(cashout.centsForNgn(200_000n, 1639.34)).toBe(123n); // 2000 / 1639.34 = 1.22000… just over 1.22
    // exact division doesn't round up
    expect(cashout.centsForNgn(165_500n, 1655)).toBe(100n);
    // one kobo more than an exact amount costs one more cent
    expect(cashout.centsForNgn(165_501n, 1655)).toBe(101n);
    expect(cashout.centsForNgn(0n, 1655)).toBe(0n);
  });

  it("converts dollars to naira rounding down, and never pays out less than was asked for", () => {
    expect(cashout.koboForCents(5000n, 1655)).toBe(8_275_000n); // $50 -> ₦82,750.00 (Linq's example)
    for (const ngn of [1n, 99n, 200_000n, 123_457n, 99_999_999n]) {
      for (const rate of [1441.29, 1500, 1639.34, 1655]) {
        const cents = cashout.centsForNgn(ngn, rate);
        expect(cashout.koboForCents(cents, rate) >= ngn, `${ngn} @ ${rate}`).toBe(true);
        // and it is the SMALLEST such number of cents
        if (cents > 0n) expect(cashout.koboForCents(cents - 1n, rate) < ngn, `${ngn} @ ${rate} minimal`).toBe(true);
      }
    }
  });

  it("refuses a nonsense rate", () => {
    expect(() => cashout.centsForNgn(100n, 0)).toThrow();
    expect(() => cashout.koboForCents(100n, -1)).toThrow();
    expect(() => cashout.centsForNgn(100n, Number.NaN)).toThrow();
  });
});
