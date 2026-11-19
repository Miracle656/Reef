import { describe, expect, it } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { wallet } from "../index";

const ME = "0x" + "a".repeat(64);
const YOU = "0x" + "b".repeat(64);
const mainnet = wallet.walletConfig("mainnet");
const USDC = mainnet.coins.find((c) => c.symbol === "USDC")!;
const USDSUI = mainnet.coins.find((c) => c.symbol === "USDSUI")!;
const SUI = mainnet.coins.find((c) => c.symbol === "SUI")!;

describe("wallet config", () => {
  it("mainnet carries the two gasless dollars and SUI", () => {
    expect(mainnet.fullnodeUrl).toBe("https://fullnode.mainnet.sui.io:443");
    expect(mainnet.coins.map((c) => c.symbol)).toEqual(["USDC", "USDSUI", "SUI"]);
    expect(USDC).toMatchObject({ type: wallet.MAINNET_USDC_TYPE, decimals: 6, gasless: true, stable: true });
    expect(USDSUI).toMatchObject({ type: wallet.MAINNET_USDSUI_TYPE, decimals: 6, gasless: true, stable: true });
    expect(SUI).toMatchObject({ type: "0x2::sui::SUI", decimals: 9, gasless: false, stable: false });
  });

  it("testnet uses Circle's test USDC, never a mainnet coin type", () => {
    const t = wallet.walletConfig("testnet");
    expect(t.fullnodeUrl).toBe("https://fullnode.testnet.sui.io:443");
    expect(t.coins.map((c) => c.type)).toEqual([wallet.TESTNET_USDC_TYPE, "0x2::sui::SUI"]);
  });

  it("only mainnet/testnet switch the wallet on", () => {
    expect(wallet.parseWalletNetwork("mainnet")).toBe("mainnet");
    expect(wallet.parseWalletNetwork(" Testnet ")).toBe("testnet");
    for (const off of [undefined, "", "devnet", "on", "1"]) expect(wallet.parseWalletNetwork(off)).toBeNull();
  });
});

describe("amounts", () => {
  it("parses decimal strings exactly", () => {
    expect(wallet.toBaseUnits("12.5", 6)).toBe(12_500_000n);
    expect(wallet.toBaseUnits("0.01", 6)).toBe(10_000n);
    expect(wallet.toBaseUnits("1,234.56", 6)).toBe(1_234_560_000n);
    expect(wallet.toBaseUnits(".5", 6)).toBe(500_000n);
    expect(wallet.toBaseUnits("5.", 6)).toBe(5_000_000n);
    expect(wallet.toBaseUnits(" 7 ", 9)).toBe(7_000_000_000n);
    // a value floats get wrong: 0.1 + 0.2
    expect(wallet.toBaseUnits("0.3", 6)).toBe(wallet.toBaseUnits("0.1", 6) + wallet.toBaseUnits("0.2", 6));
    // far past Number.MAX_SAFE_INTEGER
    expect(wallet.toBaseUnits("123456789012345678.123456", 6)).toBe(123_456_789_012_345_678_123_456n);
  });

  it("refuses anything that isn't a plain amount, instead of guessing", () => {
    for (const bad of ["", " ", ".", "abc", "1.2.3", "-1", "+1", "1e3", "0x10", "1 000"]) {
      expect(() => wallet.toBaseUnits(bad, 6), bad).toThrow();
    }
  });

  it("refuses extra decimal places rather than rounding money", () => {
    expect(() => wallet.toBaseUnits("0.1234567", 6)).toThrow(/at most 6 decimal places/);
    expect(wallet.toBaseUnits("0.123456", 6)).toBe(123_456n);
  });

  it("formats exactly and round-trips", () => {
    expect(wallet.formatUnits(12_500_000n, 6)).toBe("12.5");
    expect(wallet.formatUnits(10_000n, 6)).toBe("0.01");
    expect(wallet.formatUnits(0n, 6)).toBe("0");
    expect(wallet.formatUnits(-1_500_000n, 6)).toBe("-1.5");
    for (const s of ["0.000001", "1", "999999.999999", "42.42"]) {
      expect(wallet.formatUnits(wallet.toBaseUnits(s, 6), 6)).toBe(s);
    }
  });

  it("displays with separators, rounding DOWN so it never overstates a balance", () => {
    expect(wallet.formatAmount(1_234_567_890n, 6)).toBe("1,234.56");
    expect(wallet.formatAmount(1_999_999n, 6)).toBe("1.99");
    expect(wallet.formatAmount(0n, 6)).toBe("0.00");
    expect(wallet.formatAmount(5_000_000n, 6)).toBe("5.00");
    expect(wallet.formatAmount(1_500_000n, 6)).toBe("1.50");
    expect(wallet.formatAmount(123_456_789n, 9, 4)).toBe("0.1234");
    expect(wallet.formatAmount(2_000_000_000n, 9, 4)).toBe("2.00");
  });

  it("totals only the dollar coins", () => {
    const bal = (coin: wallet.WalletCoin, total: bigint): wallet.WalletBalance => ({ coin, total, inCoins: total, inAddressBalance: 0n });
    expect(wallet.stableTotal([bal(USDC, 1_500_000n), bal(USDSUI, 2_250_000n), bal(SUI, 9_000_000_000n)])).toBe(3_750_000n);
    expect(wallet.stableTotal([])).toBe(0n);
  });
});

describe("recipient", () => {
  it("accepts a full address and normalizes its case", () => {
    expect(wallet.parseRecipient(`  0x${"AB".repeat(32)} `)).toBe("0x" + "ab".repeat(32));
  });

  it("refuses short or malformed addresses (a padded typo is someone else's account)", () => {
    for (const bad of ["", "0x2", "0x" + "a".repeat(63), "0x" + "a".repeat(65), "a".repeat(64), "0x" + "g".repeat(64), "alice.sui"]) {
      expect(() => wallet.parseRecipient(bad), bad).toThrow(wallet.WalletInputError);
    }
  });
});

describe("buildSendTx", () => {
  const commandsOf = (tx: Transaction) => tx.getData().commands;

  it("sends a gasless coin with balance::send_funds only", () => {
    const tx = wallet.buildSendTx({ sender: ME, coin: USDC, amount: 1_000_000n, recipient: YOU });
    const data = tx.getData();
    expect(data.sender).toBe(ME);
    const calls = commandsOf(tx).filter((c) => c.$kind === "MoveCall");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.MoveCall).toMatchObject({
      package: normalizeSuiAddress("0x2"),
      module: "balance",
      function: "send_funds",
      typeArguments: [wallet.MAINNET_USDC_TYPE],
    });
    // nothing that would make the transfer ineligible for the free path
    expect(commandsOf(tx).some((c) => c.$kind === "TransferObjects" || c.$kind === "Publish" || c.$kind === "Upgrade")).toBe(false);
    // the recipient is the only pure input, as the full 32-byte address
    const pure = data.inputs.filter((i) => i.$kind === "Pure");
    expect(pure).toHaveLength(1);
    expect(Buffer.from(pure[0]!.Pure.bytes, "base64").toString("hex")).toBe("b".repeat(64));
  });

  it("sends SUI as an ordinary coin transfer (it pays its own gas)", () => {
    const tx = wallet.buildSendTx({ sender: ME, coin: SUI, amount: 1_000_000_000n, recipient: YOU });
    expect(commandsOf(tx).some((c) => c.$kind === "TransferObjects")).toBe(true);
    expect(commandsOf(tx).some((c) => c.$kind === "MoveCall" && c.MoveCall.function === "send_funds")).toBe(false);
  });

  it("enforces the network's 0.01 minimum for gasless coins", () => {
    expect(wallet.minSendAmount(USDC)).toBe(10_000n);
    expect(wallet.minSendAmount(SUI)).toBe(1n);
    expect(() => wallet.buildSendTx({ sender: ME, coin: USDC, amount: 9_999n, recipient: YOU })).toThrow(/smallest amount you can send is 0.01 USDC/);
    expect(() => wallet.buildSendTx({ sender: ME, coin: USDC, amount: 10_000n, recipient: YOU })).not.toThrow();
  });

  it("refuses a zero amount, a bad recipient and sending to yourself", () => {
    expect(() => wallet.buildSendTx({ sender: ME, coin: USDC, amount: 0n, recipient: YOU })).toThrow(wallet.WalletInputError);
    expect(() => wallet.buildSendTx({ sender: ME, coin: USDC, amount: -5n, recipient: YOU })).toThrow(wallet.WalletInputError);
    expect(() => wallet.buildSendTx({ sender: ME, coin: USDC, amount: 1_000_000n, recipient: "0x2" })).toThrow(/full Sui address/);
    expect(() => wallet.buildSendTx({ sender: ME, coin: USDC, amount: 1_000_000n, recipient: ME })).toThrow(/your own address/);
  });
});

describe("isGaslessBuilt", () => {
  const base = () => {
    const tx = new Transaction();
    tx.setSender(ME);
    return tx;
  };

  it("is true only for gas price 0 with no gas payment", () => {
    const free = base();
    free.setGasPrice(0);
    free.setGasBudget(0);
    free.setGasPayment([]);
    expect(wallet.isGaslessBuilt(free)).toBe(true);

    const paid = base();
    paid.setGasPrice(1000);
    paid.setGasPayment([]);
    expect(wallet.isGaslessBuilt(paid)).toBe(false);

    // not built yet: no price decided, so never report it as free
    expect(wallet.isGaslessBuilt(base())).toBe(false);
  });
});

describe("explorer links", () => {
  it("point at the wallet's own network", () => {
    expect(wallet.explorerTxUrl("mainnet", "abc")).toBe("https://suiscan.xyz/mainnet/tx/abc");
    expect(wallet.explorerAddressUrl("testnet", ME)).toBe(`https://suiscan.xyz/testnet/account/${ME}`);
  });
});
