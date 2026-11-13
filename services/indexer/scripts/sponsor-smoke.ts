/**
 * Live testnet smoke test for sponsorship (#11). Serves the real
 * `sponsorRoutes` on a local port and drives it through `@umbra/core`'s client
 * (`selfSponsorAndExecute` / `sponsorAndExecute`), exactly like the apps do.
 *
 *   pnpm --filter @umbra/indexer sponsor:smoke
 *
 * Each case sends `follow::create_follow_set` (gives a fresh throwaway sender
 * an empty FollowSet, nothing else) from a NEW sender that holds no SUI:
 *   - self-run sponsor · Ed25519 sender       needs SPONSOR_SECRET_KEY (funded address balance)
 *   - self-run sponsor · passkey sender       needs SPONSOR_SECRET_KEY
 *   - Enoki · passkey sender                  needs ENOKI_PRIVATE_API_KEY
 *   - Enoki · Ed25519 sender (baseline)       needs ENOKI_PRIVATE_API_KEY
 * Cases whose key is missing are skipped. Passkey senders use the software
 * authenticator in src/dev (same signature format as a phone passkey).
 * Prints digest + gas per case, so the numbers feed docs/sponsorship.md.
 */
import process from "node:process";
import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Signer } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { createSuiClient, sponsorAndExecute, selfSponsorAndExecute, testnetConfig } from "@umbra/core";
import type { IndexerEnv } from "../src/config";
import { softwarePasskey } from "../src/dev/software-passkey";
import { sponsorRoutes } from "../src/sponsor";

try {
  process.loadEnvFile();
} catch {
  /* ambient env */
}

const deployment = JSON.parse(readFileSync(new URL("../../../packages/move/deployments/testnet.json", import.meta.url), "utf8")) as {
  packageId: string;
  registryId: string;
};
const umbraBase = testnetConfig(process.env.UMBRA_PACKAGE_ID ?? deployment.packageId, process.env.UMBRA_REGISTRY_ID ?? deployment.registryId);
const umbra = process.env.SUI_GRPC_URL ? { ...umbraBase, fullnodeUrl: process.env.SUI_GRPC_URL } : umbraBase;
const client = createSuiClient(umbra);
const port = Number(process.env.SMOKE_PORT ?? 3999);

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
const app = new Hono().route("/", sponsorRoutes(env));
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
const sponsorUrl = `http://127.0.0.1:${port}/sponsor`;

function followSetTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: `${umbra.packageId}::follow::create_follow_set` });
  return tx;
}

async function gasOf(digest: string) {
  await client.core.waitForTransaction({ digest }).catch(() => {});
  const res = await client.core.getTransaction({ digest, include: { effects: true, transaction: true } });
  const t = res.Transaction ?? res.FailedTransaction!;
  const g = t.effects!.gasUsed;
  const net = BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate);
  return { ok: t.effects!.status.success, gasOwner: t.transaction?.gasData.owner ?? "?", netMist: net.toString(), gas: g };
}

const signWith = (signer: Signer) => async (bytes: string) => {
  const { signature } = await signer.signTransaction(fromBase64(bytes));
  return { signature };
};

type Case = { name: string; needs: string | undefined; run: () => Promise<{ digest: string }> };
const cases: Case[] = [
  {
    name: "self-run sponsor · Ed25519 sender",
    needs: env.selfSponsorKey,
    run: () => {
      const s = new Ed25519Keypair();
      return selfSponsorAndExecute({ sponsorUrl, client, tx: followSetTx(), sender: s.toSuiAddress(), sign: signWith(s) });
    },
  },
  {
    name: "self-run sponsor · passkey sender",
    needs: env.selfSponsorKey,
    run: () => {
      const s = softwarePasskey();
      return selfSponsorAndExecute({ sponsorUrl, client, tx: followSetTx(), sender: s.toSuiAddress(), sign: signWith(s) });
    },
  },
  {
    name: "Enoki · passkey sender",
    needs: env.enokiApiKey,
    run: () => {
      const s = softwarePasskey();
      return sponsorAndExecute({ sponsorUrl, client, tx: followSetTx(), sender: s.toSuiAddress(), network: "testnet", sign: signWith(s) });
    },
  },
  {
    name: "Enoki · Ed25519 sender (baseline)",
    needs: env.enokiApiKey,
    run: () => {
      const s = new Ed25519Keypair();
      return sponsorAndExecute({ sponsorUrl, client, tx: followSetTx(), sender: s.toSuiAddress(), network: "testnet", sign: signWith(s) });
    },
  },
];

let failed = 0;
const results: Record<string, unknown>[] = [];
for (const c of cases) {
  if (!c.needs) {
    console.log(`SKIP  ${c.name} (key not set)`);
    results.push({ case: c.name, skipped: true });
    continue;
  }
  try {
    const { digest } = await c.run();
    const g = await gasOf(digest);
    console.log(`${g.ok ? "PASS" : "FAIL"}  ${c.name}  digest=${digest}  gasOwner=${g.gasOwner}  net=${g.netMist} MIST`);
    if (!g.ok) failed++;
    results.push({ case: c.name, digest, ...g });
  } catch (e) {
    failed++;
    console.log(`FAIL  ${c.name}  ${e instanceof Error ? e.message : String(e)}`);
    results.push({ case: c.name, error: e instanceof Error ? e.message : String(e) });
  }
}
console.log(JSON.stringify(results, null, 2));
server.close();
process.exit(failed ? 1 : 0);
