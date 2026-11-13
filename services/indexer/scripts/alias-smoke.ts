/**
 * Live testnet check for passkey recovery via `0x2::address_alias` (#10), run
 * through the self-run sponsor (#11) so no account needs SUI.
 *
 *   pnpm --filter @umbra/indexer alias:smoke      # needs SPONSOR_SECRET_KEY (funded address balance)
 *
 * `main` is an Ed25519 key standing in for the zkLogin account (Google sign-in
 * can't run from a script); the passkeys use the software authenticator. Steps:
 *   1. main enables aliases (own tx)         → AddressAliases at the derived id = {main}
 *   2. main adds passkey A                   → {main, A}
 *   3. passkey A sends AS main               → succeeds (the recovery path)
 *   4. main still sends as itself            → succeeds
 *   5. a stranger sends as main              → rejected by validators
 *   6. A rotates: add passkey B, remove A    → {main, B} (lost-device rotation, one tx)
 *   7. A sends as main again                 → rejected (rotated out)
 * With ENOKI_PRIVATE_API_KEY set it also runs step 3 through Enoki.
 */
import process from "node:process";
import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Signer } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import {
  addressAliasesId,
  buildAddAliasTx,
  buildEnableAliasesTx,
  buildRotateAliasTx,
  createSuiClient,
  readAliasState,
  selfSponsorAndExecute,
  sponsorAndExecute,
  testnetConfig,
} from "@umbra/core";
import type { IndexerEnv } from "../src/config";
import { softwarePasskey } from "../src/dev/software-passkey";
import { sponsorRoutes } from "../src/sponsor";

try {
  process.loadEnvFile();
} catch {
  /* ambient env */
}
if (!process.env.SPONSOR_SECRET_KEY) throw new Error("Set SPONSOR_SECRET_KEY (funded address balance), see docs/sponsorship.md");

const deployment = JSON.parse(readFileSync(new URL("../../../packages/move/deployments/testnet.json", import.meta.url), "utf8")) as {
  packageId: string;
  registryId: string;
};
const base = testnetConfig(process.env.UMBRA_PACKAGE_ID ?? deployment.packageId, process.env.UMBRA_REGISTRY_ID ?? deployment.registryId);
const umbra = process.env.SUI_GRPC_URL ? { ...base, fullnodeUrl: process.env.SUI_GRPC_URL } : base;
const client = createSuiClient(umbra);
const port = Number(process.env.SMOKE_PORT ?? 3998);
const env: IndexerEnv = {
  umbra,
  databaseUrl: "unused",
  port,
  pollIntervalMs: 0,
  graphqlUrl: "unused",
  enokiApiKey: process.env.ENOKI_PRIVATE_API_KEY,
  selfSponsorKey: process.env.SPONSOR_SECRET_KEY,
  selfSponsorMaxGasBudget: BigInt(process.env.SPONSOR_MAX_GAS_BUDGET ?? 50_000_000),
  selfSponsorDailyBudget: BigInt(process.env.SPONSOR_DAILY_BUDGET ?? 10_000_000_000),
  dusdcDripUsd: 0,
  walrusRenewIntervalMs: 0,
};
const server = serve({ fetch: new Hono().route("/", sponsorRoutes(env)).fetch, port, hostname: "127.0.0.1" });
const sponsorUrl = `http://127.0.0.1:${port}/sponsor`;

const main = new Ed25519Keypair();
const passkeyA = softwarePasskey();
const passkeyB = softwarePasskey();
const stranger = new Ed25519Keypair();
const M = main.toSuiAddress();

const signWith = (s: Signer) => async (bytes: string) => ({ signature: (await s.signTransaction(fromBase64(bytes))).signature });
const followSet = () => {
  const tx = new Transaction();
  tx.moveCall({ target: `${umbra.packageId}::follow::create_follow_set` });
  return tx;
};
/** Send `tx` with sender = main, signed by `signer`, gas from the self-run sponsor. */
async function asMain(tx: Transaction, signer: Signer) {
  const { digest } = await selfSponsorAndExecute({ sponsorUrl, client, tx, sender: M, sign: signWith(signer) });
  await client.core.waitForTransaction({ digest });
  const res = await client.core.getTransaction({ digest, include: { effects: true } });
  const t = res.Transaction ?? res.FailedTransaction!;
  if (!t.effects!.status.success) throw new Error(`on-chain failure ${digest}: ${JSON.stringify(t.effects!.status)}`);
  return digest;
}

let failed = 0;
async function step(name: string, fn: () => Promise<string>, expectReject = false) {
  try {
    const out = await fn();
    if (expectReject) {
      failed++;
      console.log(`FAIL  ${name}: expected a rejection, got ${out}`);
    } else console.log(`PASS  ${name}  ${out}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (expectReject) console.log(`PASS  ${name}  (rejected: ${msg.slice(0, 140)})`);
    else {
      failed++;
      console.log(`FAIL  ${name}  ${msg}`);
    }
  }
}
const aliases = async () => {
  const s = await readAliasState(client, M);
  const label = (a: string) => (a === M ? "main" : a === passkeyA.toSuiAddress() ? "passkeyA" : a === passkeyB.toSuiAddress() ? "passkeyB" : a);
  return `enabled=${s.enabled} objectId=${s.objectId === addressAliasesId(M) ? "derived✓" : s.objectId} aliases=[${s.aliases.map(label).join(", ")}]`;
};

console.log(`main=${M}\npasskeyA=${passkeyA.toSuiAddress()}\npasskeyB=${passkeyB.toSuiAddress()}`);
await step("1. main enables aliases", () => asMain(buildEnableAliasesTx(), main));
await step("   state", aliases);
await step("2. main adds passkey A", () => asMain(buildAddAliasTx(M, passkeyA.toSuiAddress()), main));
await step("   state", aliases);
await step("3. passkey A sends AS main (self-run sponsor)", () => asMain(followSet(), passkeyA));
if (env.enokiApiKey) {
  await step("3b. passkey A sends AS main (Enoki sponsor)", async () => {
    const { digest } = await sponsorAndExecute({ sponsorUrl, client, tx: followSet(), sender: M, network: "testnet", sign: signWith(passkeyA) });
    return digest;
  });
} else console.log("SKIP  3b. Enoki variant (ENOKI_PRIVATE_API_KEY not set)");
await step("4. main still sends as itself", () => asMain(followSet(), main));
await step("5. a stranger sends as main", () => asMain(followSet(), stranger), true);
await step("6. passkey A rotates: add B, remove A", () => asMain(buildRotateAliasTx(M, passkeyA.toSuiAddress(), passkeyB.toSuiAddress()), passkeyA));
await step("   state", aliases);
await step("7. rotated-out passkey A sends as main", () => asMain(followSet(), passkeyA), true);
await step("8. passkey B sends as main", () => asMain(followSet(), passkeyB));

server.close();
process.exit(failed ? 1 : 0);
