import { describe, expect, it } from "vitest";
import { buildTipTx, formatUnits, tipCoins, toBaseUnits, TESTNET_TIP_USDC_TYPE } from "../contracts/tip";

describe("tip amounts (no floating point with money)", () => {
  it("parses human amounts into exact base units", () => {
    expect(toBaseUnits("2", 6)).toBe(2_000_000n);
    expect(toBaseUnits("0.5", 6)).toBe(500_000n);
    expect(toBaseUnits(".25", 6)).toBe(250_000n);
    expect(toBaseUnits("1.000001", 6)).toBe(1_000_001n);
    expect(toBaseUnits("0.1", 9)).toBe(100_000_000n);
    // 0.1 + 0.2 style float traps don't apply
    expect(toBaseUnits("0.3", 6)).toBe(300_000n);
  });

  it("rejects zero, negatives, junk and too many decimals", () => {
    for (const bad of ["", ".", "0", "0.000", "-1", "1e3", "abc", "1.2.3", "1.0000001"]) {
      expect(toBaseUnits(bad, 6), bad).toBeNull();
    }
  });

  it("formats base units back without trailing zeros", () => {
    expect(formatUnits(2_000_000n, 6)).toBe("2");
    expect(formatUnits("500000", 6)).toBe("0.5");
    expect(formatUnits(1_000_001n, 6)).toBe("1.000001");
    expect(formatUnits(0n, 9)).toBe("0");
    expect(formatUnits(toBaseUnits("12.34", 9)!, 9)).toBe("12.34");
  });
});

describe("buildTipTx", () => {
  it("sends from the sender's own funds (never the sponsor's gas coin)", () => {
    const tx = buildTipTx({ recipient: "0x" + "b".repeat(64), coinType: TESTNET_TIP_USDC_TYPE, amount: 2_000_000n });
    const data = tx.getData();
    const intent = data.commands.find((c) => c.$kind === "$Intent");
    expect(intent?.$kind === "$Intent" && intent.$Intent.data).toMatchObject({ type: TESTNET_TIP_USDC_TYPE, balance: 2_000_000n });
    expect(JSON.stringify(data.commands, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toMatch(/GasCoin/);
    expect(data.commands.at(-1)?.$kind).toBe("TransferObjects");
  });

  it("refuses a zero tip", () => {
    expect(() => buildTipTx({ recipient: "0x1", coinType: "0x2::sui::SUI", amount: 0n })).toThrow();
  });

  it("offers USDC then SUI, with the configured USDC type", () => {
    expect(tipCoins("0xabc::usdc::USDC").map((c) => [c.symbol, c.type, c.decimals])).toEqual([
      ["USDC", "0xabc::usdc::USDC", 6],
      ["SUI", "0x2::sui::SUI", 9],
    ]);
  });
});
