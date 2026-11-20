import { describe, expect, it } from "vitest";
import type { DeepBookCompatibleClient } from "@mysten/deepbook-v3";
import { swap, wallet } from "../index";
import { priceFromBook } from "../server";

const ME = "0x" + "a".repeat(64);
const mainnet = wallet.walletConfig("mainnet");
const USDC = mainnet.coins.find((c) => c.symbol === "USDC")!;
const USDSUI = mainnet.coins.find((c) => c.symbol === "USDSUI")!;
const SUI = mainnet.coins.find((c) => c.symbol === "SUI")!;
const bal = (coin: wallet.WalletCoin, total: bigint): wallet.WalletBalance => ({ coin, total, inCoins: total, inAddressBalance: 0n });

const market = swap.swapMarket(mainnet)!;
const rules: swap.SwapRules = { step: 100_000_000n, smallest: 1_000_000_000n, feePpb: 250_000n }; // 0.1 SUI, 1 SUI, 0.025%
const sui = (n: string) => wallet.toBaseUnits(n, 9);

describe("what the wallet is worth", () => {
  it("adds SUI at its price to the dollar coins", () => {
    // 1.5005 SUI at $0.6529 = $0.97967645, plus $3.75
    const v = wallet.walletValue([bal(USDC, 1_500_000n), bal(USDSUI, 2_250_000n), bal(SUI, 1_500_500_000n)], { SUI: 652_900n });
    expect(v.dollars).toBe(3_750_000n);
    expect(v.priced).toEqual({ SUI: 979_676n }); // rounded down, never up
    expect(v.total).toBe(4_729_676n);
    expect(v.unpriced).toEqual([]);
  });

  it("is the user's case: only SUI in the wallet", () => {
    const v = wallet.walletValue([bal(USDC, 0n), bal(USDSUI, 0n), bal(SUI, 1_500_500_000n)], { SUI: 652_900n });
    expect(wallet.formatAmount(v.total, 6)).toBe("0.97");
    expect(v.dollars).toBe(0n);
  });

  it("leaves a coin with no price out of the total, and says which", () => {
    const held = bal(SUI, 2_000_000_000n);
    for (const prices of [{}, { SUI: undefined }, { SUI: 0n }, { SUI: -5n }]) {
      const v = wallet.walletValue([bal(USDC, 1_000_000n), held], prices);
      expect(v.total).toBe(1_000_000n);
      expect(v.unpriced).toEqual([held]);
      expect(v.priced).toEqual({});
    }
    // with no argument at all it is the dollar coins alone
    expect(wallet.walletValue([bal(USDC, 1_000_000n), held]).total).toBe(wallet.stableTotal([bal(USDC, 1_000_000n), held]));
  });

  it("doesn't call an empty balance unpriced", () => {
    const v = wallet.walletValue([bal(USDC, 0n), bal(SUI, 0n)], {});
    expect(v).toEqual({ total: 0n, dollars: 0n, priced: {}, unpriced: [] });
  });

  it("stays exact for large balances", () => {
    // 313,694.136543 SUI at $0.6529
    const v = wallet.walletValue([bal(SUI, 313_694_136_543_000n)], { SUI: 652_900n });
    expect(v.total).toBe(204_810_901_748n);
  });
});

describe("SUI's price from the order book", () => {
  it("is halfway between the best bid and the best ask", () => {
    expect(priceFromBook({ bid_prices: [0.65439, 0.65432], ask_prices: [0.65474, 0.65495] })).toBe(654_565n);
    expect(priceFromBook({ bid_prices: [0.999], ask_prices: [1.001] })).toBe(1_000_000n);
  });

  it("is nothing when the book can't be trusted", () => {
    expect(priceFromBook({ bid_prices: [], ask_prices: [0.66] })).toBeNull(); // nobody buying
    expect(priceFromBook({ bid_prices: [0.65], ask_prices: [] })).toBeNull(); // nobody selling
    expect(priceFromBook({ bid_prices: [0.5], ask_prices: [0.9] })).toBeNull(); // far apart
    expect(priceFromBook({ bid_prices: [0.7], ask_prices: [0.6] })).toBeNull(); // crossed
    expect(priceFromBook({ bid_prices: [0], ask_prices: [0.6] })).toBeNull();
    expect(priceFromBook({ bid_prices: [Number.NaN], ask_prices: [0.6] })).toBeNull();
    expect(priceFromBook({ bid_prices: [0.6], ask_prices: [Number.POSITIVE_INFINITY] })).toBeNull();
  });

  it("allows a gap of up to about 2 percent", () => {
    expect(priceFromBook({ bid_prices: [0.991], ask_prices: [1.009] })).toBe(1_000_000n); // 1.8% apart
    expect(priceFromBook({ bid_prices: [0.98], ask_prices: [1.02] })).toBeNull(); // 4% apart
  });
});

describe("the swap on offer", () => {
  it("is SUI to USDC on mainnet, and nothing on testnet", () => {
    expect(market).toMatchObject({ network: "mainnet", poolKey: "SUI_USDC", from: SUI, to: USDC });
    expect(market.deepType).toMatch(/::deep::DEEP$/);
    // testnet's DeepBook trades its own test dollar, not the wallet's test USDC
    expect(swap.swapMarket(wallet.walletConfig("testnet"))).toBeNull();
  });
});

describe("the least to accept", () => {
  it("is the quote less 1 percent, rounded down", () => {
    expect(swap.minOutFor(849_238n)).toBe(840_745n);
    expect(swap.minOutFor(1_000_000n)).toBe(990_000n);
    expect(swap.minOutFor(100n, 50n)).toBe(99n);
  });

  it("is never zero, so a swap can't be built that accepts nothing", () => {
    expect(swap.minOutFor(0n)).toBe(1n);
    expect(swap.minOutFor(1n)).toBe(1n);
  });
});

describe("what to hand the pool", () => {
  it("rounds what was typed down to a whole step", () => {
    expect(swap.sellable(rules, sui("1.4"))).toBe(sui("1.4"));
    expect(swap.sellable(rules, sui("1.45"))).toBe(sui("1.4"));
    expect(swap.sellable(rules, sui("1.4999"))).toBe(sui("1.4"));
    expect(swap.sellable(rules, sui("0.05"))).toBe(0n);
    expect(swap.sellable(rules, 0n)).toBe(0n);
    expect(swap.sellable(rules, -5n)).toBe(0n);
  });

  it("adds the pool's fee on top, so the whole quantity is sold", () => {
    // 1.4 SUI + 0.025% = 1.40035, plus one unit of slack
    expect(swap.offerFor(rules, sui("1.4"))).toBe(1_400_350_001n);
    expect(swap.offerFor(rules, sui("1"))).toBe(1_000_250_001n);
    // what the pool then sells: the offer with its fee taken out, down to a step
    for (const q of ["1", "1.4", "2.3", "100", "313694.1"]) {
      const quantity = sui(q);
      const sold = (swap.offerFor(rules, quantity) * 1_000_000_000n) / (1_000_000_000n + rules.feePpb);
      expect(sold - (sold % rules.step), q).toBe(quantity);
    }
  });
});

describe("checking an amount before asking the network", () => {
  const refuses = (check: () => unknown, text: RegExp) => {
    let err: unknown;
    try {
      check();
    } catch (e) {
      err = e;
    }
    expect(err, `expected a refusal matching ${text}`).toBeInstanceOf(wallet.WalletInputError);
    expect((err as Error).message).toMatch(text);
  };
  const check = (quantity: bigint, balance: bigint) => () => swap.checkSwapAmount(market, rules, quantity, balance);

  it("passes the user's case: 1.4 of 1.5005 SUI", () => {
    expect(check(sui("1.4"), sui("1.5005"))).not.toThrow();
    expect(check(sui("1"), sui("1.5005"))).not.toThrow(); // the minimum itself is fine: the fee is added on top
  });

  it("refuses nothing, too little, a part step, and more than there is", () => {
    refuses(check(0n, sui("5")), /Enter an amount/);
    refuses(check(-1n, sui("5")), /Enter an amount/);
    refuses(check(sui("0.5"), sui("5")), /The smallest swap is 1\.00 SUI/);
    refuses(check(sui("1.45"), sui("5")), /steps of 0\.10 SUI/);
    refuses(check(sui("6"), sui("5")), /You only have 5\.00 SUI/);
  });

  it("keeps the network fee back, and says how much can be swapped instead", () => {
    refuses(check(sui("1.5"), sui("1.5005")), /0\.05 SUI stays behind for the network fee, so the most you can swap is 1\.40 SUI/);
    // not enough for any swap once the fee is kept back
    refuses(check(sui("1"), sui("1.04")), /You need a little more SUI/);
  });

  it("works out the most that can be swapped", () => {
    expect(swap.maxSwap(rules, sui("1.5005"))).toBe(sui("1.4"));
    expect(swap.maxSwap(rules, sui("100"))).toBe(sui("99.9"));
    expect(swap.maxSwap(rules, sui("1.0503"))).toBe(sui("1")); // just enough: 1 + its fee + the reserve
    expect(swap.maxSwap(rules, sui("1.05025"))).toBe(0n); // one unit short of that
    expect(swap.maxSwap(rules, sui("1.05"))).toBe(0n);
    expect(swap.maxSwap(rules, sui("0.3"))).toBe(0n);
    expect(swap.maxSwap(rules, sui("0.05"))).toBe(0n);
    expect(swap.maxSwap(rules, 0n)).toBe(0n);
    // whatever it says can be swapped passes the check, and one step more does not
    for (const have of ["1.0503", "1.5005", "7", "313694.136543"]) {
      const most = swap.maxSwap(rules, sui(have));
      expect(check(most, sui(have)), have).not.toThrow();
      expect(check(most + rules.step, sui(have)), have).toThrow(wallet.WalletInputError);
    }
  });

  it("fills in a share of the balance for the 25% / 50% / Max buttons", () => {
    // a share of what is held, in whole steps
    expect(swap.swapShare(rules, sui("10"), 25n)).toBe(sui("2.5"));
    expect(swap.swapShare(rules, sui("10"), 50n)).toBe(sui("5"));
    expect(swap.swapShare(rules, sui("4.07"), 25n)).toBe(sui("1")); // 1.0175, down to a step
    // "Max" is the most that can be swapped, not the whole balance
    expect(swap.swapShare(rules, sui("10"), 100n)).toBe(swap.maxSwap(rules, sui("10")));
    expect(swap.swapShare(rules, sui("10"), 100n)).toBe(sui("9.9"));
    // a small wallet: a quarter or a half is under the 1 SUI minimum, so those buttons are off
    expect(swap.swapShare(rules, sui("1.5005"), 25n)).toBe(0n);
    expect(swap.swapShare(rules, sui("1.5005"), 50n)).toBe(0n);
    expect(swap.swapShare(rules, sui("1.5005"), 100n)).toBe(sui("1.4"));
    expect(swap.swapShare(rules, sui("3.9"), 25n)).toBe(0n); // 0.975, under the minimum
    // never more than can be swapped once the fees are kept back
    expect(swap.swapShare(rules, sui("1.14"), 99n)).toBe(sui("1"));
    // nothing to swap, or nothing asked for
    expect(swap.swapShare(rules, 0n, 100n)).toBe(0n);
    expect(swap.swapShare(rules, sui("1.05"), 100n)).toBe(0n);
    expect(swap.swapShare(rules, sui("10"), 0n)).toBe(0n);
    expect(swap.swapShare(rules, sui("10"), -25n)).toBe(0n);
    // whatever a button fills in passes the check
    for (const have of ["1.0503", "1.14", "1.5005", "2.2", "4", "7.77", "313694.136543"]) {
      for (const percent of [25n, 50n, 75n, 99n, 100n]) {
        const part = swap.swapShare(rules, sui(have), percent);
        if (part > 0n) expect(check(part, sui(have)), `${percent}% of ${have}`).not.toThrow();
      }
    }
  });

  it("turns what was typed into a quantity and what to hand over", () => {
    expect(swap.planSwap(market, rules, sui("1.4"), sui("1.5005"))).toEqual({ quantity: sui("1.4"), offer: 1_400_350_001n });
    // a part step is dropped, not refused
    expect(swap.planSwap(market, rules, sui("1.45"), sui("1.5005"))).toEqual({ quantity: sui("1.4"), offer: 1_400_350_001n });
    refuses(() => swap.planSwap(market, rules, 0n, sui("5")), /Enter an amount/);
    // under one step rounds to nothing: the message is about the minimum, not "enter an amount"
    refuses(() => swap.planSwap(market, rules, sui("0.05"), sui("5")), /The smallest swap is 1\.00 SUI/);
    refuses(() => swap.planSwap(market, rules, sui("0.99"), sui("5")), /The smallest swap is 1\.00 SUI/);
    refuses(() => swap.planSwap(market, rules, sui("1.5"), sui("1.5005")), /the most you can swap is 1\.40 SUI/);
  });
});

describe("the swap transaction", () => {
  // Building the commands needs no network: the pool and coin ids come from the SDK's own list.
  const db = swap.createSwapClient({} as DeepBookCompatibleClient, market, ME);
  const tx = swap.buildSwapTx(db, market, ME, sui("1.4"), 840_745n);
  const data = tx.getData();
  const commands = data.commands;
  const kinds = commands.map((c) => c.$kind);

  it("comes from the wallet, with the fee capped at the reserve", () => {
    expect(data.sender).toBe(ME);
    expect(BigInt(data.gasData.budget ?? 0)).toBe(swap.SWAP_FEE_RESERVE);
  });

  it("trades on the SUI/USDC pool with no DEEP offered", () => {
    const call = commands.find((c) => c.$kind === "MoveCall" && c.MoveCall.function === "swap_exact_base_for_quote");
    expect(call, "the pool's swap call").toBeDefined();
    if (call?.$kind !== "MoveCall") throw new Error("unreachable");
    expect(call.MoveCall.module).toBe("pool");
    expect(call.MoveCall.typeArguments).toEqual([expect.stringMatching(/::sui::SUI$/), USDC.type]);
  });

  it("puts unsold SUI back, clears the empty DEEP coin, and checks the minimum itself", () => {
    // ... the swap, MergeCoins(unsold into the gas coin), destroy_zero(DEEP), SplitCoins(minimum), MergeCoins(back), TransferObjects
    expect(kinds.slice(-5)).toEqual(["MergeCoins", "MoveCall", "SplitCoins", "MergeCoins", "TransferObjects"]);
    const [putBack, destroy, split, , transfer] = commands.slice(-5);
    if (putBack?.$kind !== "MergeCoins" || destroy?.$kind !== "MoveCall" || split?.$kind !== "SplitCoins" || transfer?.$kind !== "TransferObjects") {
      throw new Error("unexpected command shapes");
    }
    expect(putBack.MergeCoins.destination.$kind).toBe("GasCoin");
    expect(`${destroy.MoveCall.module}::${destroy.MoveCall.function}`).toBe("coin::destroy_zero");
    expect(destroy.MoveCall.typeArguments).toEqual([market.deepType]);
    // exactly one thing leaves the transaction for the wallet: the USDC
    expect(transfer.TransferObjects.objects).toHaveLength(1);
    expect(split.SplitCoins.coin).toEqual(transfer.TransferObjects.objects[0]);
  });

  it("can't be built without a minimum, or for nothing", () => {
    expect(() => swap.buildSwapTx(db, market, ME, sui("1.4"), 0n)).toThrow(/minimum/);
    expect(() => swap.buildSwapTx(db, market, ME, 0n, 1n)).toThrow(wallet.WalletInputError);
  });
});

describe("reading what a swap did", () => {
  const gas = { computationCost: "100000", storageCost: "3000000", storageRebate: "1200000" }; // net fee 1,900,000
  const SUI_LONG = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

  it("separates the trade from the network fee", () => {
    const out = swap.readSwapOutcome(
      market,
      ME,
      [
        { coinType: SUI_LONG, address: ME, amount: "-1302225000" }, // 1.300325 SUI traded + 0.0019 SUI fee
        { coinType: USDC.type, address: ME, amount: "848900" },
      ],
      gas,
    );
    expect(out).toEqual({ received: 848_900n, paid: 1_300_325_000n, fee: 1_900_000n });
  });

  it("handles a refund bigger than the fee (many small coins merged)", () => {
    const out = swap.readSwapOutcome(
      market,
      ME,
      [
        { coinType: "0x2::sui::SUI", address: ME, amount: "-1055432548" },
        { coinType: USDC.type, address: ME, amount: "849758" },
      ],
      { computationCost: "100000", storageCost: "70550800", storageRebate: "315543252" },
    );
    expect(out.fee).toBe(0n);
    expect(out.paid).toBe(1_300_325_000n);
    expect(out.received).toBe(849_758n);
  });

  it("ignores other people's balances and other coins", () => {
    const out = swap.readSwapOutcome(
      market,
      ME,
      [
        { coinType: SUI_LONG, address: "0x" + "b".repeat(64), amount: "999999999" },
        { coinType: USDSUI.type, address: ME, amount: "5000000" },
        { coinType: USDC.type, address: "0x" + "b".repeat(64), amount: "7000000" },
      ],
      gas,
    );
    expect(out).toEqual({ received: 0n, paid: 0n, fee: 1_900_000n });
  });

  it("reports a swap that did nothing as nothing received", () => {
    const out = swap.readSwapOutcome(market, ME, [{ coinType: SUI_LONG, address: ME, amount: "-1900000" }], gas);
    expect(out).toEqual({ received: 0n, paid: 0n, fee: 1_900_000n });
  });
});
