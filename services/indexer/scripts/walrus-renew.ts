/**
 * Manual Walrus renewal run.
 *   pnpm --filter @umbra/indexer walrus:renew                 # uses WALRUS_RENEWER_SECRET_KEY
 *   pnpm --filter @umbra/indexer walrus:renew --dry-run [0xOwner]
 */
import process from "node:process";
import { testnetConfig } from "@umbra/core";
import { renewWalrusBlobs } from "../src/walrus-renew";

try {
  process.loadEnvFile();
} catch {
  /* ambient env */
}
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ownerOverride = args.find((a) => a.startsWith("0x"));
const umbra = testnetConfig("0x0", "0x0");
const res = await renewWalrusBlobs({
  umbra: process.env.SUI_GRPC_URL ? { ...umbra, fullnodeUrl: process.env.SUI_GRPC_URL } : umbra,
  secretKey: process.env.WALRUS_RENEWER_SECRET_KEY ?? "",
  dryRun,
  ownerOverride,
  thresholdEpochs: Number(process.env.WALRUS_RENEW_THRESHOLD_EPOCHS ?? 7),
  targetEpochsAhead: Number(process.env.WALRUS_RENEW_TARGET_EPOCHS ?? 50),
});
console.log(JSON.stringify(res));
