/**
 * Read-only check of the wallet against a live network. Prints an address's
 * wallet balances, then BUILDS and SIMULATES the smallest send of each coin it
 * holds, to confirm the gasless path still applies (gas price 0, success).
 * It never signs or executes anything, so it is safe to point at any address.
 *
 *   pnpm --filter @umbra/indexer wallet:probe testnet 0xYOUR_ADDRESS
 *   pnpm --filter @umbra/indexer wallet:probe mainnet 0xYOUR_ADDRESS
 */
import process from "node:process";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { createSuiClient, wallet } from "@umbra/core";

function usage(problem?: string): never {
  if (problem) console.error(problem);
  console.error("usage: wallet:probe <mainnet|testnet> <0xaddress>");
  process.exit(2);
}

const network = wallet.parseWalletNetwork(process.argv[2]);
if (!network) usage();
let sender: string;
try {
  sender = wallet.parseRecipient(process.argv[3] ?? "");
} catch (e) {
  usage(e instanceof Error ? e.message : String(e));
}

const cfg = wallet.walletConfig(network);
const client = createSuiClient(cfg);
const recipient = new Ed25519Keypair().toSuiAddress(); // throwaway; nothing is ever sent

const balances = await wallet.getWalletBalances(client, sender, cfg.coins);
console.log(`${network} ${sender}`);
for (const b of balances) {
  console.log(
    `  ${b.coin.symbol.padEnd(7)} ${wallet.formatAmount(b.total, b.coin.decimals, 6).padStart(18)}` +
      `   (coins ${wallet.formatUnits(b.inCoins, b.coin.decimals)}, address balance ${wallet.formatUnits(b.inAddressBalance, b.coin.decimals)})`,
  );
}
console.log(`  dollars: $${wallet.formatAmount(wallet.stableTotal(balances), 6)}`);

let failed = 0;
for (const b of balances) {
  const amount = wallet.minSendAmount(b.coin);
  if (b.total < amount) {
    console.log(`SKIP  ${b.coin.symbol}: holds less than the minimum send`);
    continue;
  }
  try {
    const tx = wallet.buildSendTx({ sender, coin: b.coin, amount, recipient });
    const bytes = await tx.build({ client });
    const gasless = wallet.isGaslessBuilt(tx);
    const sim = await client.core.simulateTransaction({ transaction: bytes, include: { effects: true } });
    const effects = (sim.Transaction ?? sim.FailedTransaction)?.effects;
    const ok = sim.$kind === "Transaction" && effects?.status.success === true;
    const commands = tx
      .getData()
      .commands.map((c) => (c.$kind === "MoveCall" ? `${c.MoveCall.module}::${c.MoveCall.function}` : c.$kind))
      .join(" -> ");
    // A coin we call gasless must actually build gasless, or users without SUI can't send it.
    const expected = gasless === b.coin.gasless;
    if (!ok || !expected) failed++;
    console.log(
      `${ok && expected ? "PASS" : "FAIL"}  ${b.coin.symbol}: send ${wallet.formatUnits(amount, b.coin.decimals)} -> ` +
        `${gasless ? "gasless (gas price 0)" : `pays gas (price ${tx.getData().gasData.price})`}, simulate ${ok ? "ok" : JSON.stringify(effects?.status)}  [${commands}]`,
    );
  } catch (e) {
    failed++;
    console.log(`FAIL  ${b.coin.symbol}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
process.exit(failed ? 1 : 0);
