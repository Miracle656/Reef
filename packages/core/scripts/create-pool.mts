/**
 * Create a permissionless DeepBook v3 pool: SULTAN / DEEP (testnet).
 * Lives in @umbra/core so bare imports (@mysten/sui, @mysten/deepbook-v3) resolve.
 *
 *   wsl ... sui keytool export ... > packages/core/scripts/.signer.json
 *   (from services/indexer) pnpm exec tsx ../../packages/core/scripts/create-pool.mts
 *   then delete .signer.json
 *
 * Costs 500 DEEP. Writes pool.testnet.json next to this script.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { DeepBookClient, testnetCoins } from "@mysten/deepbook-v3";

const SULTAN_PKG = "0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b";
const SULTAN_TYPE = `${SULTAN_PKG}::creator_coin::CREATOR_COIN`;

const raw = JSON.parse(readFileSync(new URL("./.signer.json", import.meta.url), "utf8"));
const priv: string = raw.exportedPrivateKey ?? raw.privateKey ?? raw.key;
const { secretKey } = decodeSuiPrivateKey(priv);
const keypair = Ed25519Keypair.fromSecretKey(secretKey);
const address = keypair.toSuiAddress();
console.log("signer:", address);

const client = new SuiJsonRpcClient({ url: "https://fullnode.testnet.sui.io:443", network: "testnet" });

const db = new DeepBookClient({
  client,
  address,
  network: "testnet",
  coins: { ...testnetCoins, SULTAN: { address: SULTAN_PKG, type: SULTAN_TYPE, scalar: 1_000_000_000 } },
});

const tx = new Transaction();
db.deepBook.createPermissionlessPool({ baseCoinKey: "SULTAN", quoteCoinKey: "DEEP", tickSize: 0.001, lotSize: 1, minSize: 1 })(tx);

const res = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showObjectChanges: true, showEffects: true },
});

console.log("status:", res.effects?.status?.status);
if (res.effects?.status?.status !== "success") {
  console.error("FAILED:", JSON.stringify(res.effects?.status));
  process.exit(1);
}

const pool = (res.objectChanges ?? []).find(
  (c) => c.type === "created" && typeof c.objectType === "string" && c.objectType.includes("::pool::Pool<"),
);
const poolId = pool && "objectId" in pool ? pool.objectId : null;
const out = { network: "testnet", poolKey: "SULTAN_DEEP", poolId, baseType: SULTAN_TYPE, quote: "DEEP", tickSize: 0.001, lotSize: 1, minSize: 1, digest: res.digest };
writeFileSync(new URL("./pool.testnet.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
