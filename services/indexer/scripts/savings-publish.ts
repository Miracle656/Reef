/**
 * Publish + set up the savings package (#15) on TESTNET and write
 * packages/savings/deployments/testnet.json.
 *
 *   SAVINGS_DEPLOYER_SECRET_KEY=suiprivkey... pnpm --filter @umbra/indexer savings:publish
 *
 * Steps: build (`sui move build --dump-bytecode-as-base64`) → publish →
 * create the vault + frozen config for the underlying coin → (test USDC only)
 * mint 1,000 and top the vault up so yield is backed.
 *
 * Env:
 *   SAVINGS_DEPLOYER_SECRET_KEY  deployer (keeps UpgradeCap + AdminCap). Gas is
 *                                paid from its SUI coins or address balance.
 *   SAVINGS_UNDERLYING           coin type savings accepts. Default: this
 *                                package's test USDC. Set Circle's USDC on mainnet.
 *   SAVINGS_APR_BPS              mock lender APR (default 500 = 5%)
 *   SUI_BIN                      sui CLI (default "sui")
 *   SAVINGS_DEPLOYMENT_OUT       where to write the deployment JSON
 */
import process from "node:process";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { createSuiClient, savings, testnetConfig } from "@umbra/core";

try {
  process.loadEnvFile();
} catch {
  /* ambient env */
}
const secret = process.env.SAVINGS_DEPLOYER_SECRET_KEY;
if (!secret) throw new Error("Set SAVINGS_DEPLOYER_SECRET_KEY");
const deployer = Ed25519Keypair.fromSecretKey(secret);
const me = deployer.toSuiAddress();
const base = testnetConfig("0x0", "0x0");
const client = createSuiClient(process.env.SUI_GRPC_URL ? { ...base, fullnodeUrl: process.env.SUI_GRPC_URL } : base);
const pkgDir = fileURLToPath(new URL("../../../packages/savings", import.meta.url));
const aprBps = Number(process.env.SAVINGS_APR_BPS ?? 500);

async function run(tx: Transaction, label: string) {
  tx.setSender(me);
  const res = await deployer.signAndExecuteTransaction({ transaction: tx, client });
  if (res.$kind !== "Transaction") throw new Error(`${label} failed: ${res.FailedTransaction.digest}`);
  const { digest } = res.Transaction;
  await client.core.waitForTransaction({ digest });
  const full = await client.core.getTransaction({ digest, include: { effects: true, objectTypes: true } });
  const t = full.Transaction ?? full.FailedTransaction!;
  if (!t.effects!.status.success) throw new Error(`${label} failed on-chain: ${digest}`);
  console.log(`${label}: ${digest}`);
  const created = t.effects!.changedObjects.filter((c) => c.inputState === "DoesNotExist");
  const typeOf = (id: string) => t.objectTypes?.[id] ?? "";
  return { digest, created, typeOf };
}
const find = (r: Awaited<ReturnType<typeof run>>, re: RegExp) => {
  const hit = r.created.find((c) => re.test(r.typeOf(c.objectId)));
  if (!hit) throw new Error(`no created object matching ${re}`);
  return hit.objectId;
};

// 1. build + publish
const { modules, dependencies } = JSON.parse(
  execFileSync(process.env.SUI_BIN ?? "sui", ["move", "build", "--dump-bytecode-as-base64", "--path", pkgDir], { encoding: "utf8" }),
) as { modules: string[]; dependencies: string[] };
const pub = new Transaction();
pub.transferObjects([pub.publish({ modules, dependencies })], me);
const published = await run(pub, "publish");
const packageId = published.created.find((c) => c.outputState === "PackageWrite")!.objectId;
const adminCapId = find(published, /::mock_yield::AdminCap$/);
const receiptMintId = find(published, /::mock_yield::ReceiptMint$/);
const faucetId = find(published, /::test_usdc::Faucet$/);
const underlyingType = process.env.SAVINGS_UNDERLYING ?? `${packageId}::test_usdc::TEST_USDC`;

// 2. vault + frozen config (+ bonus pool)
const setup = new Transaction();
setup.moveCall({
  target: `${packageId}::mock_yield::create_vault`,
  typeArguments: [underlyingType],
  arguments: [setup.object(adminCapId), setup.object(receiptMintId), setup.pure.u64(aprBps), setup.object("0x6")],
});
setup.moveCall({
  target: `${packageId}::savings::create_config`,
  typeArguments: [underlyingType],
  arguments: [setup.object(adminCapId), setup.pure.vector("u64", savings.LOCK_DURATIONS_MS)],
});
const setupRes = await run(setup, "setup");
const vaultId = find(setupRes, /::mock_yield::MockVault</);
const configId = find(setupRes, /::savings::SavingsConfig$/);
const bonusPoolId = find(setupRes, /::savings::BonusPool$/);

// 3. back the yield (test USDC only: we can mint it)
if (underlyingType.endsWith("::test_usdc::TEST_USDC")) {
  const top = new Transaction();
  const [c] = top.moveCall({ target: `${packageId}::test_usdc::mint`, arguments: [top.object(faucetId), top.pure.u64(1_000_000_000)] });
  top.moveCall({ target: `${packageId}::mock_yield::top_up`, typeArguments: [underlyingType], arguments: [top.object(vaultId), c!] });
  await run(top, "top up 1,000 tUSDC");
}

const deployment = {
  network: "testnet",
  packageId,
  configId,
  vaultId,
  bonusPoolId,
  faucetId,
  underlyingType,
  aprBps,
  deployer: me,
  adminCapId,
  publishDigest: published.digest,
  publishedAt: new Date().toISOString(),
};
const out = process.env.SAVINGS_DEPLOYMENT_OUT ?? `${pkgDir}/deployments/testnet.json`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(deployment, null, 2) + "\n");
console.log(`wrote ${out}`);
console.log(JSON.stringify(deployment, null, 2));
