/**
 * Self-run sponsor (#11): move SUI from the sponsor key's coins into its
 * **address balance**, which is what pays gas when payment = [].
 *
 *   pnpm --filter @umbra/indexer sponsor:fund        # print balances only
 *   pnpm --filter @umbra/indexer sponsor:fund 5      # move 5 SUI into the address balance
 *
 * Needs SPONSOR_SECRET_KEY. Top the key up first (testnet: https://faucet.sui.io).
 */
import process from "node:process";
import { createSuiClient, testnetConfig } from "@umbra/core";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

try {
  process.loadEnvFile();
} catch {
  /* ambient env */
}

const secret = process.env.SPONSOR_SECRET_KEY;
if (!secret) throw new Error("Set SPONSOR_SECRET_KEY");
const sponsor = Ed25519Keypair.fromSecretKey(secret);
const owner = sponsor.toSuiAddress();
const umbra = testnetConfig("0x0", "0x0");
const client = createSuiClient(process.env.SUI_GRPC_URL ? { ...umbra, fullnodeUrl: process.env.SUI_GRPC_URL } : umbra);

const sui = (mist: string | bigint) => (Number(BigInt(mist)) / 1e9).toFixed(4);
async function show(label: string) {
  const { balance } = await client.core.getBalance({ owner, coinType: "0x2::sui::SUI" });
  console.log(`${label} ${owner}: coins ${sui(balance.coinBalance)} SUI | address balance ${sui(balance.addressBalance)} SUI`);
}

await show("sponsor");
const amount = Number(process.argv[2] ?? 0);
if (amount > 0) {
  const tx = new Transaction();
  tx.setSender(owner);
  const [coin] = tx.splitCoins(tx.gas, [BigInt(Math.round(amount * 1e9))]);
  // coin::send_funds deposits a Coin into an address balance.
  tx.moveCall({ target: "0x2::coin::send_funds", typeArguments: ["0x2::sui::SUI"], arguments: [coin!, tx.pure.address(owner)] });
  const res = await sponsor.signAndExecuteTransaction({ transaction: tx, client });
  if (res.$kind !== "Transaction") throw new Error(`funding failed: ${res.FailedTransaction.digest}`);
  await client.core.waitForTransaction({ digest: res.Transaction.digest }).catch(() => {});
  console.log(`moved ${amount} SUI into the address balance: ${res.Transaction.digest}`);
  await show("sponsor");
}
