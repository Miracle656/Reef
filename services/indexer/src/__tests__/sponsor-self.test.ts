import { describe, expect, it } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import { testnetConfig } from "@umbra/core";
import type { IndexerEnv } from "../config";
import { sponsorRoutes } from "../sponsor";

const PKG = "0x" + "a".repeat(64);
const sponsor = new Ed25519Keypair();
const user = new Ed25519Keypair();

function env(over: Partial<IndexerEnv> = {}): IndexerEnv {
  return {
    umbra: testnetConfig(PKG, "0x" + "b".repeat(64)),
    databaseUrl: "postgres://unused",
    port: 0,
    pollIntervalMs: 0,
    graphqlUrl: "https://unused",
    dusdcDripUsd: 0,
    walrusRenewIntervalMs: 0,
    selfSponsorKey: sponsor.getSecretKey(),
    selfSponsorMaxGasBudget: 50_000_000n,
    selfSponsorDailyBudget: 10_000_000_000n,
    ...over,
  };
}

/** Fully specified tx (no object inputs), so it builds offline and the
 *  policy runs without touching the network. */
async function signedTx(edit: (tx: Transaction) => void) {
  const tx = new Transaction();
  tx.setSender(user.toSuiAddress());
  tx.setGasOwner(sponsor.toSuiAddress());
  tx.setGasPayment([]);
  tx.setGasBudget(10_000_000);
  tx.setGasPrice(1000);
  tx.setExpiration({
    ValidDuring: { minEpoch: "1", maxEpoch: "2", minTimestamp: null, maxTimestamp: null, chain: "1".repeat(32), nonce: 1 },
  });
  edit(tx);
  const bytes = await tx.build();
  const { signature } = await user.signTransaction(bytes);
  return { txBytes: toBase64(bytes), signature };
}

const post = (app: ReturnType<typeof sponsorRoutes>, body: unknown) =>
  app.request("/sponsor/self", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("/sponsor/self", () => {
  it("is off without SPONSOR_SECRET_KEY", async () => {
    const app = sponsorRoutes(env({ selfSponsorKey: undefined }));
    expect((await app.request("/sponsor/self")).status).toBe(503);
    expect((await post(app, {})).status).toBe(503);
  });

  it("publishes the sponsor address and budget cap", async () => {
    const res = await sponsorRoutes(env()).request("/sponsor/self");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sponsorAddress: sponsor.toSuiAddress(), maxGasBudget: "50000000" });
  });

  it("400s on a missing signature", async () => {
    expect((await post(sponsorRoutes(env()), { txBytes: "AA==" })).status).toBe(400);
  });

  it("403s (and never co-signs) a call outside the allowlist", async () => {
    const body = await signedTx((tx) => tx.moveCall({ target: `${"0x" + "9".repeat(64)}::evil::drain`, arguments: [] }));
    const res = await post(sponsorRoutes(env()), body);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/call not sponsored/);
  });

  it("429s an allowed transaction once the daily budget is used up (before co-signing)", async () => {
    const body = await signedTx((tx) => tx.moveCall({ target: `${PKG}::follow::create_follow_set` }));
    const res = await post(sponsorRoutes(env({ selfSponsorDailyBudget: 1n })), body);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/daily budget/);
  });

  it("403s a transaction that splits the gas coin (the sponsor's balance)", async () => {
    const body = await signedTx((tx) => {
      const [c] = tx.splitCoins(tx.gas, [1_000_000_000]);
      tx.transferObjects([c], user.toSuiAddress());
    });
    const res = await post(sponsorRoutes(env()), body);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/gas coin/);
  });
});
