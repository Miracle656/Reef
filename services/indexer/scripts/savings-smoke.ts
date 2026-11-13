/**
 * Live testnet run of savings (#15), gasless through the self-run sponsor:
 * a brand-new user (0 SUI) mints test USDC, saves in Flex, opens a Lock, breaks
 * it early, withdraws Flex, and opens a 0% Halal lock.
 *
 *   SAVINGS_DEPLOYMENT=packages/savings/deployments/testnet.json \
 *   SPONSOR_SECRET_KEY=... pnpm --filter @umbra/indexer savings:smoke
 */
import process from "node:process";
import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { createSuiClient, savings, selfSponsorAndExecute, testnetConfig } from "@umbra/core";
import type { IndexerEnv } from "../src/config";
import { sponsorRoutes } from "../src/sponsor";

try {
  process.loadEnvFile();
} catch {
  /* ambient env */
}
const path = process.env.SAVINGS_DEPLOYMENT ?? new URL("../../../packages/savings/deployments/testnet.json", import.meta.url);
const dep = JSON.parse(readFileSync(path, "utf8")) as savings.SavingsDeployment & { faucetId: string };
const base = testnetConfig("0x0", "0x0");
const umbra = process.env.SUI_GRPC_URL ? { ...base, fullnodeUrl: process.env.SUI_GRPC_URL } : base;
const client = createSuiClient(umbra);
const port = Number(process.env.SMOKE_PORT ?? 3996);
const env: IndexerEnv = {
  umbra,
  databaseUrl: "unused",
  port,
  pollIntervalMs: 0,
  graphqlUrl: "unused",
  selfSponsorKey: process.env.SPONSOR_SECRET_KEY,
  selfSponsorMaxGasBudget: 50_000_000n,
  selfSponsorDailyBudget: 10_000_000_000n,
  savingsPackageId: dep.packageId,
  dusdcDripUsd: 0,
  walrusRenewIntervalMs: 0,
};
const server = serve({ fetch: new Hono().route("/", sponsorRoutes(env)).fetch, port, hostname: "127.0.0.1" });
const sponsorUrl = `http://127.0.0.1:${port}/sponsor`;
const user = new Ed25519Keypair();
const U = user.toSuiAddress();
const USD = 1_000_000n;
const fmt = (u: bigint) => `${Number(u) / 1e6}`;

async function send(tx: Transaction, label: string) {
  const { digest } = await selfSponsorAndExecute({
    sponsorUrl,
    client,
    tx,
    sender: U,
    sign: async (b) => ({ signature: (await user.signTransaction(fromBase64(b))).signature }),
  });
  await client.core.waitForTransaction({ digest });
  const res = await client.core.getTransaction({ digest, include: { effects: true, objectTypes: true } });
  const t = res.Transaction ?? res.FailedTransaction!;
  if (!t.effects!.status.success) throw new Error(`${label} failed on-chain: ${digest}`);
  console.log(`PASS  ${label}  ${digest}`);
  return { digest, created: t.effects!.changedObjects.filter((c) => c.inputState === "DoesNotExist"), types: t.objectTypes ?? {} };
}
const bal = async (type: string) => BigInt((await client.core.getBalance({ owner: U, coinType: type })).balance.balance);

console.log(`user ${U} (holds no SUI)`);
// 1. faucet: 100 test USDC
const mint = new Transaction();
const [c] = mint.moveCall({ target: `${dep.packageId}::test_usdc::mint`, arguments: [mint.object(dep.faucetId), mint.pure.u64(100n * USD)] });
mint.transferObjects([c!], U);
await send(mint, "mint 100 tUSDC");

// 2. Flex: deposit 40
await send(savings.buildDepositFlexTx(dep, 40n * USD, U), "Flex deposit 40");
const receipts = await bal(savings.receiptType(dep));
console.log(`      holds ${fmt(receipts)} mUSDC receipts, ${fmt(await bal(dep.underlyingType))} tUSDC`);

// 3. Lock 50 for 1 month (breakable)
const opened = await send(
  savings.buildOpenLockTx(dep, { amount: 50n * USD, durationMs: savings.LOCK_DURATIONS_MS[0]!, breakable: true }),
  "open 1-month lock with 50",
);
const lockId = opened.created.find((o) => /::savings::SavingsLock</.test(opened.types[o.objectId] ?? ""))!.objectId;
console.log(`      lock ${lockId}`);

// 4. Break it early: principal back
const before = await bal(dep.underlyingType);
await send(savings.buildBreakEarlyTx(dep, lockId, U), "break the lock early");
console.log(`      got back ${fmt((await bal(dep.underlyingType)) - before)} tUSDC (principal 50)`);

// 5. Flex: withdraw everything
const before2 = await bal(dep.underlyingType);
await send(savings.buildWithdrawFlexTx(dep, receipts, U), "Flex withdraw all");
console.log(`      got back ${fmt((await bal(dep.underlyingType)) - before2)} tUSDC (deposited 40)`);

// 6. 0% Halal lock with 10 (left open)
await send(savings.buildOpenLockTx(dep, { amount: 10n * USD, durationMs: savings.LOCK_DURATIONS_MS[0]!, breakable: true, halal: true }), "open Halal lock with 10");
console.log(`      final: ${fmt(await bal(dep.underlyingType))} tUSDC, ${fmt(await bal(savings.receiptType(dep)))} mUSDC`);
server.close();
process.exit(0);
