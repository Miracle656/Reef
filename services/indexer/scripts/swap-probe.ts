/**
 * Live, READ-ONLY check of the wallet's "swap SUI to USDC" on mainnet. It runs
 * the app's own code (`swap` in @umbra/core and the price reader) against the
 * real DeepBook pool, but only ever simulates: nothing is signed or sent.
 *
 *   pnpm --filter @umbra/indexer swap:probe [address] [amount in SUI]
 *
 * `address` is whose wallet to simulate (it needs the SUI; default: a large
 * holder). `amount` defaults to 1.4. Checks:
 *   1. SUI's dollar price can be read from the order book
 *   2. the pool's step and minimum are what the app expects to work with
 *   3. a quote, the built swap and its simulation agree, and the swap leaves
 *      nothing behind but the USDC
 *   4. a swap that can't meet its minimum is refused before there is anything
 *      to sign, and so is an amount below the pool's minimum
 */
import process from "node:process";
import { readSuiUsdPrice } from "@umbra/core/server";
import { createSuiClient, swap, wallet } from "@umbra/core";

const sender = wallet.parseRecipient(process.argv[2] ?? "0x9f63425709069336fec108bd4ba69a8f3d23e8ab237311f3ce58ae2bb0ed4d7f");
const config = wallet.walletConfig("mainnet");
const client = createSuiClient(config);
const market = swap.swapMarket(config);
if (!market) throw new Error("no swap market on mainnet");
const amount = wallet.toBaseUnits(process.argv[3] ?? "1.4", market.from.decimals);

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}
const sui = (v: bigint) => `${wallet.formatAmount(v, market.from.decimals, 6)} SUI`;
const usdc = (v: bigint) => `${wallet.formatAmount(v, market.to.decimals, 6)} USDC`;
const short = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 150);

console.log(`simulating as ${sender}\n`);

console.log("1. Price");
const price = await readSuiUsdPrice(client, "mainnet");
check("SUI's dollar price reads from the order book", price !== null && price > 10_000n && price < 1_000_000_000n, price === null ? "none" : `$${wallet.formatAmount(price, 6, 4)}`);

console.log("\n2. The pool's rules");
const db = swap.createSwapClient(client, market, sender);
const rules = await swap.readSwapRules(db, market);
check("trades in steps, with a minimum and a small fee", rules.step > 0n && rules.smallest >= rules.step && rules.feePpb > 0n && rules.feePpb < 10_000_000n, `step ${sui(rules.step)}, smallest ${sui(rules.smallest)}, fee ${Number(rules.feePpb) / 1e7}%`);

console.log(`\n3. Swapping ${sui(amount)}`);
const balances = await wallet.getWalletBalances(client, sender, config.coins);
const held = balances.find((b) => b.coin.symbol === market.from.symbol)?.total ?? 0n;
// The amount typed is what gets sold; the pool's fee goes on top of it.
const { quantity, offer } = swap.planSwap(market, rules, amount, held);
check("the amount passes the app's own checks", quantity > 0n && offer > quantity, `selling ${sui(quantity)}, handing over ${sui(offer)}, wallet holds ${sui(held)}`);
const quote = await swap.quoteSwap(db, market, offer);
check("the pool quotes it, selling all of it", quote.out > 0n && quote.back < rules.step / 100n, `${usdc(quote.out)}, ${sui(quote.back)} back`);
const minOut = swap.minOutFor(quote.out);
try {
  const tx = swap.buildSwapTx(db, market, sender, offer, minOut);
  const bytes = await tx.build({ client });
  const sim = await client.core.simulateTransaction({ transaction: bytes, include: { effects: true, balanceChanges: true, objectTypes: true } });
  const t = sim.Transaction ?? sim.FailedTransaction;
  check("the network would run it", sim.$kind === "Transaction" && t?.effects?.status.success === true, JSON.stringify(t?.effects?.status.error ?? "")?.slice(0, 120));
  const out = swap.readSwapOutcome(market, sender, t?.balanceChanges ?? [], t!.effects!.gasUsed);
  check("it pays out at least the minimum", out.received >= minOut, `${usdc(out.received)} for ${sui(out.paid)}, minimum ${usdc(minOut)}`);
  check("it sells what was asked, plus the pool's fee and nothing more", out.paid > quantity && out.paid <= offer, `asked ${sui(quantity)}, paid ${sui(out.paid)}`);
  if (price) {
    const rate = (out.received * 10n ** 9n) / out.paid; // micro-dollars per SUI
    const off = Number(rate - price) / Number(price);
    check("at a rate close to the price shown in the wallet", Math.abs(off) < 0.02, `$${wallet.formatAmount(rate, 6, 4)} per SUI, ${(off * 100).toFixed(2)}% from the mid price`);
  }
  check("the gas budget is the reserve the app keeps back", BigInt(tx.getData().gasData.budget ?? 0) === swap.SWAP_FEE_RESERVE, `${sui(swap.SWAP_FEE_RESERVE)}`);
  const types = t?.objectTypes ?? {};
  // (The pool also opens a record of its own for a first-time trader; that isn't a coin and isn't the user's.)
  const coins = (t?.effects?.changedObjects ?? [])
    .filter((o) => o.idOperation === "Created")
    .map((o) => types[o.objectId] ?? "?")
    .filter((type) => /::coin::Coin</.test(type))
    .map((type) => type.replace(/0x[0-9a-f]{60,}/g, (m) => `${m.slice(0, 8)}…`));
  check("it leaves one new coin, the USDC, and no empty ones", coins.length === 1 && /usdc::USDC/.test(coins[0] ?? ""), coins.join(", ") || "no coin created");
  console.log(`     other coins touched: ${(t?.balanceChanges ?? []).filter((c) => !/::sui::SUI$|::usdc::USDC$/.test(c.coinType)).map((c) => c.coinType).join(", ") || "none"}`);
} catch (e) {
  check("the swap builds and simulates", false, short(e));
}

console.log("\n4. What must be refused");
try {
  await swap.buildSwapTx(db, market, sender, offer, quote.out * 2n).build({ client });
  check("a minimum the market can't meet", false, "it built");
} catch (e) {
  check("a minimum the market can't meet", /abort|insufficient|balance/i.test(short(e)), short(e).slice(0, 90));
}
const tiny = rules.smallest / 2n;
try {
  swap.planSwap(market, rules, tiny, held);
  check("an amount below the pool's minimum (app check)", false, "accepted");
} catch (e) {
  check("an amount below the pool's minimum (app check)", e instanceof wallet.WalletInputError, short(e));
}
const tinyQuote = await swap.quoteSwap(db, market, tiny);
check("which the pool wouldn't trade anyway", tinyQuote.out === 0n, `${usdc(tinyQuote.out)} for ${sui(tiny)}`);
try {
  await swap.buildSwapTx(db, market, sender, tiny, 1n).build({ client });
  check("and which can't be built into a do-nothing swap", false, "it built");
} catch (e) {
  check("and which can't be built into a do-nothing swap", /abort|insufficient|balance/i.test(short(e)), short(e).slice(0, 90));
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
