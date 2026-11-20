/**
 * Swap SUI for USDC inside the wallet, on DeepBook (Sui's on-chain order book).
 *
 * People get paid in SUI but the wallet is about dollars (and cash-out only
 * takes dollars), so this turns one into the other. The wallet trades straight
 * against the public SUI/USDC book: no account with anyone, no ReeF fee, and the
 * coins never leave the user's own address except into the trade itself.
 *
 * How the pool behaves (measured on mainnet, 2026-11):
 * - it trades SUI in steps (0.1 SUI) and not below a minimum (1 SUI); whatever
 *   doesn't fit a whole step comes straight back
 * - its fee (about 0.025%) is taken out of the SUI going in, so no DEEP token is
 *   needed. To sell exactly what the user typed, the wallet hands over that
 *   much plus the fee (`offerFor`)
 * - a swap too small to trade "succeeds" and does nothing, and the pool skips
 *   its own minimum-to-receive check when that happens. So the transaction
 *   built here checks the minimum itself, and fails outright rather than charge
 *   a network fee for nothing
 *
 * The flow mirrors sending: quote, build, dry-run, show that result, then sign
 * exactly those bytes. The minimum to receive is inside the signed transaction,
 * so if the price moves too far before it lands the swap cancels itself.
 *
 * This file pulls in the DeepBook SDK, so the web app loads it only when the
 * swap screen is opened.
 */
import { DeepBookClient, mainnetCoins, type DeepBookCompatibleClient } from "@mysten/deepbook-v3";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";
import { SWAP_NETWORK, WalletInputError, formatAmount, type WalletCoin, type WalletConfig, type WalletNetwork } from "./index";

export interface SwapMarket {
  network: WalletNetwork;
  /** DeepBook's name for the pool */
  poolKey: string;
  /** what is sold */
  from: WalletCoin;
  /** what is bought */
  to: WalletCoin;
  /** DeepBook's own token. Swaps here never spend it, but the pool's call takes a (empty) coin of it. */
  deepType: string;
}

/**
 * The swap this wallet offers, or null. Mainnet only: the testnet DeepBook
 * trades its own test dollar, not the test USDC the wallet holds.
 */
export function swapMarket(config: WalletConfig): SwapMarket | null {
  if (config.network !== SWAP_NETWORK) return null;
  const from = config.coins.find((c) => c.symbol === "SUI");
  const to = config.coins.find((c) => c.symbol === "USDC");
  const deep = mainnetCoins.DEEP;
  return from && to && deep ? { network: config.network, poolKey: "SUI_USDC", from, to, deepType: deep.type } : null;
}

/**
 * The most a swap's network fee can come to (its gas budget), in MIST. The
 * real fee is a small fraction of this. "Swap everything" keeps this much back,
 * because the fee is paid from the same SUI.
 */
export const SWAP_FEE_RESERVE = 50_000_000n; // 0.05 SUI

/** How far the price may move against the user between the review and the swap landing, in hundredths of a percent. */
export const SWAP_SLIPPAGE_BPS = 100n; // 1%

/** The least the user will accept for a quoted amount: the quote less the allowed slippage, never zero. */
export function minOutFor(quoted: bigint, slippageBps: bigint = SWAP_SLIPPAGE_BPS): bigint {
  const min = (quoted * (10_000n - slippageBps)) / 10_000n;
  return min > 0n ? min : 1n;
}

/** A DeepBook client for `sender`'s swaps. Reads go through simulation, so `sender` needs no funds to quote. */
export function createSwapClient(client: DeepBookCompatibleClient, market: SwapMarket, sender: string): DeepBookClient {
  return new DeepBookClient({ client, address: sender, network: market.network });
}

export interface SwapRules {
  /** the pool sells whole multiples of this, in base units of what is sold */
  step: bigint;
  /** and nothing smaller than this */
  smallest: bigint;
  /** the pool's fee on what goes in, in billionths (250_000 = 0.025%) */
  feePpb: bigint;
}

const baseUnits = (human: number, decimals: number) => BigInt(Math.round(human * 10 ** decimals));
const BILLION = 1_000_000_000n;

/**
 * A fee paid out of the coin going in costs this much more than one paid in
 * DEEP (DeepBook's `fee_penalty_multiplier`). If DeepBook ever changes it, a
 * swap sells one step less than asked and the review screen says so: nothing
 * else depends on this number.
 */
const INPUT_FEE_MULTIPLIER = 1.25;

/** The pool's step, minimum and fee. */
export async function readSwapRules(db: DeepBookClient, market: SwapMarket): Promise<SwapRules> {
  const [book, trade] = await Promise.all([db.poolBookParams(market.poolKey), db.poolTradeParams(market.poolKey)]);
  return {
    step: baseUnits(book.lotSize, market.from.decimals),
    smallest: baseUnits(book.minSize, market.from.decimals),
    feePpb: BigInt(Math.round(trade.takerFee * INPUT_FEE_MULTIPLIER * 1e9)),
  };
}

/** What was typed, rounded down to what the pool can sell (a whole number of steps). */
export function sellable(rules: SwapRules, typed: bigint): bigint {
  return typed > 0n ? typed - (typed % rules.step) : 0n;
}

/**
 * How much to hand the pool so that exactly `quantity` is sold. The pool takes
 * its fee out of what goes in, so offering the quantity alone would sell one
 * step less. Rounded up, plus one unit, so rounding can't fall short.
 */
export function offerFor(rules: SwapRules, quantity: bigint): bigint {
  return quantity + (quantity * rules.feePpb + BILLION - 1n) / BILLION + 1n;
}

/**
 * The most that can be sold from `balance`: a whole number of steps, with the
 * pool's fee on top and the network-fee reserve kept back. 0 when there isn't
 * enough for a swap at all.
 */
export function maxSwap(rules: SwapRules, balance: bigint): bigint {
  const spare = balance - SWAP_FEE_RESERVE;
  if (spare <= 0n) return 0n;
  let most = sellable(rules, (spare * BILLION) / (BILLION + rules.feePpb));
  // Rounding in offerFor can push the last step just out of reach.
  if (most > 0n && offerFor(rules, most) > spare) most -= rules.step;
  return most >= rules.smallest ? most : 0n;
}

/**
 * What a "25%" or "50%" button fills in: that share of `balance`, as a whole
 * number of steps and never more than {@link maxSwap}. 100 is the most that can
 * be swapped. 0 when the share is under the pool's minimum, so the button can
 * be switched off instead of filling in an amount that would be refused.
 */
export function swapShare(rules: SwapRules, balance: bigint, percent: bigint): bigint {
  const most = maxSwap(rules, balance);
  if (most <= 0n || percent <= 0n) return 0n;
  if (percent >= 100n) return most;
  const part = sellable(rules, (balance * percent) / 100n);
  const capped = part > most ? most : part;
  return capped >= rules.smallest ? capped : 0n;
}

/**
 * Check a quantity to sell before asking the network about it. `quantity` and
 * `balance` are in base units of what is sold. Throws {@link WalletInputError}
 * with a sentence for the screen.
 */
export function checkSwapAmount(market: SwapMarket, rules: SwapRules, quantity: bigint, balance: bigint): void {
  const { from } = market;
  const show = (v: bigint) => `${formatAmount(v, from.decimals, 4)} ${from.symbol}`;
  if (quantity <= 0n) throw new WalletInputError("Enter an amount");
  if (quantity < rules.smallest) throw new WalletInputError(`The smallest swap is ${show(rules.smallest)}`);
  if (quantity % rules.step !== 0n) throw new WalletInputError(`This market trades ${from.symbol} in steps of ${show(rules.step)}`);
  if (quantity > balance) throw new WalletInputError(`You only have ${show(balance)}`);
  if (offerFor(rules, quantity) + SWAP_FEE_RESERVE > balance) {
    const most = maxSwap(rules, balance);
    throw new WalletInputError(
      most > 0n
        ? `${show(SWAP_FEE_RESERVE)} stays behind for the network fee, so the most you can swap is ${show(most)}`
        : `You need a little more ${from.symbol}: a swap keeps ${show(SWAP_FEE_RESERVE)} back for the network fee`,
    );
  }
}

/**
 * Turn what the user typed into a swap: the quantity the pool will sell (typed,
 * rounded down to a whole step) and what to hand it for that (the quantity plus
 * its fee). Throws {@link WalletInputError} if it can't be done from `balance`.
 */
export function planSwap(market: SwapMarket, rules: SwapRules, typed: bigint, balance: bigint): { quantity: bigint; offer: bigint } {
  if (typed <= 0n) throw new WalletInputError("Enter an amount");
  const quantity = sellable(rules, typed);
  // A typed amount under one step rounds to nothing: say what the minimum is, not "enter an amount".
  checkSwapAmount(market, rules, quantity > 0n ? quantity : 1n, balance);
  return { quantity, offer: offerFor(rules, quantity) };
}

export interface SwapQuote {
  /** what would be received, in base units of what is bought */
  out: bigint;
  /** what would come back unswapped, in base units of what is sold */
  back: bigint;
}

/** Ask the pool what handing it `offer` would fetch right now, with its fee paid out of the offer. Moves nothing. */
export async function quoteSwap(db: DeepBookClient, market: SwapMarket, offer: bigint): Promise<SwapQuote> {
  const q = await db.getQuoteQuantityOutInputFee(market.poolKey, offer);
  return { out: baseUnits(q.quoteOut, market.to.decimals), back: baseUnits(q.baseOut, market.from.decimals) };
}

/**
 * The swap itself. `amount` of what is sold goes in (see {@link offerFor}); the transaction fails
 * unless at least `minOut` of what is bought comes out. That is enforced twice:
 * by the pool, and by this transaction (see below), because the pool returns
 * early without checking when the amount is under its minimum size.
 */
export function buildSwapTx(db: DeepBookClient, market: SwapMarket, sender: string, amount: bigint, minOut: bigint): Transaction {
  if (amount <= 0n) throw new WalletInputError("Enter an amount");
  if (minOut <= 0n) throw new Error("buildSwapTx: a swap must set a minimum to receive");
  const tx = new Transaction();
  tx.setSender(normalizeSuiAddress(sender));
  // The SDK would otherwise reserve 0.25 SUI for the fee, more than a small wallet holds.
  tx.setGasBudget(SWAP_FEE_RESERVE);
  // No DEEP is offered, so the pool takes its fee from the SUI going in.
  const [unsold, bought, deep] = db.deepBook.swapExactBaseForQuote({ poolKey: market.poolKey, amount, deepAmount: 0n, minOut })(tx);
  // What didn't fit a whole step goes back into the coin it came from.
  tx.mergeCoins(tx.gas, [unsold]);
  // The DEEP coin went in empty and comes back empty: don't leave an empty coin behind.
  tx.moveCall({ target: "0x2::coin::destroy_zero", typeArguments: [market.deepType], arguments: [deep] });
  // Our own minimum: taking `minOut` out of a coin that holds less aborts the
  // whole transaction. Then it is put straight back.
  const [floor] = tx.splitCoins(bought, [minOut]);
  tx.mergeCoins(bought, [floor]);
  tx.transferObjects([bought], normalizeSuiAddress(sender));
  return tx;
}

export interface SwapOutcome {
  /** received, in base units of what is bought */
  received: bigint;
  /** what left the wallet for the trade itself (sold plus the pool's fee), in base units of what is sold */
  paid: bigint;
  /** network fee in MIST, never below zero */
  fee: bigint;
}

interface GasUsed {
  computationCost: string | bigint;
  storageCost: string | bigint;
  storageRebate: string | bigint;
}

/**
 * Read what a simulated (or executed) swap did to `sender`, from the network's
 * own account of it. The fee is paid from the same coin that is sold, so it is
 * taken back out of the change in that coin.
 */
export function readSwapOutcome(
  market: SwapMarket,
  sender: string,
  balanceChanges: readonly { coinType: string; address: string; amount: string | bigint }[],
  gasUsed: GasUsed,
): SwapOutcome {
  const me = normalizeSuiAddress(sender);
  const change = (coin: WalletCoin) =>
    balanceChanges
      .filter((c) => normalizeSuiAddress(c.address) === me && normalizeStructTag(c.coinType) === normalizeStructTag(coin.type))
      .reduce((sum, c) => sum + BigInt(c.amount), 0n);
  const netFee = BigInt(gasUsed.computationCost) + BigInt(gasUsed.storageCost) - BigInt(gasUsed.storageRebate);
  const received = change(market.to);
  // change in what is sold = -(paid) - (network fee)
  const paid = -change(market.from) - netFee;
  return { received: received > 0n ? received : 0n, paid: paid > 0n ? paid : 0n, fee: netFee > 0n ? netFee : 0n };
}
