/**
 * dUSDC drip faucet (D-3 funding gap). Gas is sponsored via Enoki, but Predict
 * trades are collateralised in dUSDC — a fresh zkLogin user holds none, so mint
 * aborts. This endpoint transfers a small amount of dUSDC from a server-held,
 * funded keypair to a new address on first ask.
 *
 * The faucet key pays its OWN gas (in SUI) — fund it with both SUI and dUSDC.
 * Idempotency: we skip addresses that already hold enough dUSDC, plus a short
 * in-memory per-address cooldown to blunt repeat calls.
 */
import { Hono } from "hono";
import { createSuiClient } from "@umbra/core";
import { PREDICT_DUSDC_TYPE } from "@umbra/core/server";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import type { IndexerEnv } from "./config";

const DUSDC_DECIMALS = 6;
const COOLDOWN_MS = 10 * 60 * 1000; // one drip per address / 10 min
const lastDrip = new Map<string, number>();

export function faucetRoutes(env: IndexerEnv): Hono {
  const app = new Hono();
  const keypair = env.dusdcFaucetKey ? Ed25519Keypair.fromSecretKey(env.dusdcFaucetKey) : null;
  const client = createSuiClient(env.umbra);
  const dripBase = BigInt(Math.round(env.dusdcDripUsd * 10 ** DUSDC_DECIMALS));

  app.post("/faucet/dusdc", async (c) => {
    if (!keypair) return c.json({ error: "faucet not configured (set DUSDC_FAUCET_SECRET_KEY)" }, 503);

    const { address } = await c.req.json<{ address: string }>();
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(address ?? "")) return c.json({ error: "invalid address" }, 400);

    // Idempotency 1: already funded enough to trade → no-op.
    try {
      const bal = await client.getBalance({ owner: address, coinType: PREDICT_DUSDC_TYPE });
      if (BigInt(bal.totalBalance) >= dripBase) return c.json({ funded: true, skipped: "already funded" });
    } catch {
      /* balance read failed — fall through and try the drip */
    }

    // Idempotency 2: per-address cooldown.
    const now = Date.now();
    const prev = lastDrip.get(address) ?? 0;
    if (now - prev < COOLDOWN_MS) return c.json({ funded: true, skipped: "cooldown" });
    lastDrip.set(address, now);

    try {
      const tx = new Transaction();
      tx.setSender(keypair.toSuiAddress());
      const coin = tx.add(coinWithBalance({ balance: dripBase, type: PREDICT_DUSDC_TYPE }));
      tx.transferObjects([coin], tx.pure.address(address));
      const res = await keypair.signAndExecuteTransaction({ transaction: tx, client });
      if (res.$kind !== "Transaction") throw new Error("drip transaction failed on-chain");
      return c.json({ funded: true, amountUsd: env.dusdcDripUsd, digest: res.Transaction.digest });
    } catch (e) {
      lastDrip.delete(address); // failed — let them retry
      return c.json({ error: e instanceof Error ? e.message : "drip failed" }, 500);
    }
  });

  return app;
}
