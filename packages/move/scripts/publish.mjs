#!/usr/bin/env node
/**
 * Publish the Umbra Move package to Sui testnet and record the deployment.
 *
 * Prerequisites (one-time):
 *   1. A working Sui client config pointing at testnet:
 *        sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
 *        sui client switch --env testnet
 *      (and an address: `sui client new-address ed25519`)
 *   2. Gas: fund the active address from https://faucet.sui.io (or `sui client faucet`).
 *
 * Run:  node scripts/publish.mjs
 *
 * Writes deployments/testnet.json with the package ID and the shared Registry
 * object ID, and prints the values you must copy into the root .env.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(__dirname, "..");
const GAS_BUDGET = process.env.GAS_BUDGET ?? "200000000";

function sui(args) {
  return execFileSync("sui", args, { cwd: pkgDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// Guard: make sure we are on testnet, never mainnet.
const env = sui(["client", "active-env"]).trim();
if (env !== "testnet") {
  console.error(`Refusing to publish: active Sui env is "${env}", expected "testnet".`);
  console.error(`Switch with:  sui client switch --env testnet`);
  process.exit(1);
}

console.log("Building + publishing to testnet…");
const raw = sui([
  "client",
  "publish",
  "--gas-budget",
  GAS_BUDGET,
  "--json",
]);

const result = JSON.parse(raw);
const changes = result.objectChanges ?? [];

const published = changes.find((c) => c.type === "published");
if (!published) {
  console.error("Could not find a 'published' change in the result. Raw output:");
  console.error(raw);
  process.exit(1);
}
const packageId = published.packageId;

const registry = changes.find(
  (c) => c.type === "created" && typeof c.objectType === "string" && c.objectType.endsWith("::registry::Registry"),
);

const deployment = {
  network: "testnet",
  packageId,
  registryId: registry?.objectId ?? null,
  clockId: "0x6",
  publishedAt: new Date().toISOString(),
  digest: result.digest ?? null,
};

const outDir = join(pkgDir, "deployments");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "testnet.json");
writeFileSync(outFile, JSON.stringify(deployment, null, 2) + "\n");

console.log("\nDeployment recorded ->", outFile);
console.log(JSON.stringify(deployment, null, 2));
console.log("\nCopy these into your root .env:");
console.log(`  UMBRA_PACKAGE_ID=${deployment.packageId}`);
console.log(`  UMBRA_REGISTRY_ID=${deployment.registryId ?? "<registry-not-found>"}`);
