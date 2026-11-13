/**
 * Sponsor endpoints, matching the fetch contract in `@umbra/core`'s
 * `sponsor-client`. Move-call targets are locked to an allowlist in both modes.
 *
 * - Enoki (`POST /sponsor`, `POST /sponsor/execute`): holds the private API key
 *   server-side; Enoki builds the gas and co-signs.
 * - Self-run (`GET|POST /sponsor/self`, #11): our own key pays gas from its SUI
 *   address balance; the user signs first, we check `checkSelfSponsorable`,
 *   co-sign and execute. Enabled by `SPONSOR_SECRET_KEY`.
 */
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import {
  checkSelfSponsorable,
  createEnokiClient,
  executeSponsoredTransaction,
  frameworkCoinTargets,
  messagingAllowedTargets,
  normalizeMoveTarget,
  predictAllowedTargets,
  sponsorTransaction,
  SponsorPolicyError,
  umbraAllowedTargets,
} from "@umbra/core/server";
import { createSuiClient, savings, type SuiNetwork } from "@umbra/core";
import type { IndexerEnv } from "./config";

/** Self-run sponsor rate limit: transactions per sender per window. */
const SELF_LIMIT = 30;
const SELF_WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pull the status + message out of an EnokiClientError (or any error) for logs
 *  + a structured client response, so failures show up in Render instead of a
 *  bare 500. The status is echoed back as the HTTP code so the client's retry
 *  logic can tell a transient 5xx/429 from a deterministic 4xx. */
function describeError(err: unknown): { status: ContentfulStatusCode; message: string } {
  const e = err as { status?: number; message?: string; errors?: { message?: string }[] } | undefined;
  const raw = typeof e?.status === "number" ? e.status : 500;
  const status = (raw >= 400 && raw <= 599 ? raw : 502) as ContentfulStatusCode;
  const message = e?.errors?.[0]?.message ?? e?.message ?? "unknown sponsor error";
  return { status, message };
}

export function sponsorRoutes(env: IndexerEnv): Hono {
  const app = new Hono();
  const enoki = env.enokiApiKey ? createEnokiClient(env.enokiApiKey) : null;
  // ReeF's own package + DeepBook Predict + Sui Stack Messaging group targets,
  // plus the 0x2 coin/balance plumbing `coinWithBalance` emits (redeem_funds,
  // send_funds, destroy_zero…). Enoki rejects the whole PTB if any call is
  // missing, so without these a "swap all" or a sender holding an address
  // balance fails. They only move the sender's own funds.
  const allowed = [
    ...umbraAllowedTargets(env.umbra.packageId),
    ...predictAllowedTargets(),
    ...messagingAllowedTargets(),
    ...frameworkCoinTargets().map(normalizeMoveTarget),
    // #15 savings (testnet): the six savings entry points + the test-USDC faucet.
    ...(env.savingsPackageId
      ? [...savings.savingsAllowedTargets(env.savingsPackageId), env.savingsPackageId + "::test_usdc::mint"].map(normalizeMoveTarget)
      : []),
  ];

  app.post("/sponsor", async (c) => {
    if (!enoki) return c.json({ error: "sponsor not configured (set ENOKI_PRIVATE_API_KEY)" }, 503);
    const body = await c.req.json<{ transactionKindBytes: string; sender: string; network?: SuiNetwork }>();
    try {
      const res = await sponsorTransaction(enoki, {
        network: body.network ?? env.umbra.network,
        transactionKindBytes: body.transactionKindBytes,
        sender: body.sender,
        allowedMoveCallTargets: allowed,
      });
      console.log(`[sponsor] ok sender=${body.sender} digest=${res.digest}`);
      return c.json(res);
    } catch (err) {
      const { status, message } = describeError(err);
      console.error(`[sponsor] FAIL sender=${body.sender} status=${status} msg=${message}`);
      return c.json({ error: message, status }, status);
    }
  });

  app.post("/sponsor/execute", async (c) => {
    if (!enoki) return c.json({ error: "sponsor not configured" }, 503);
    const { digest, signature } = await c.req.json<{ digest: string; signature: string }>();
    try {
      const res = await executeSponsoredTransaction(enoki, { digest, signature });
      console.log(`[sponsor] executed digest=${res.digest}`);
      return c.json(res);
    } catch (err) {
      const { status, message } = describeError(err);
      console.error(`[sponsor] EXEC FAIL digest=${digest} status=${status} msg=${message}`);
      return c.json({ error: message, status }, status);
    }
  });

  // ---- self-run sponsor (#11): gas from our own key's SUI address balance ----
  // The user signs first (see `selfSponsorAndExecute` in @umbra/core); we check
  // the policy on the exact bytes, co-sign and execute. No Enoki involved, so
  // new move-call targets don't need an Enoki portal allowlist change.
  const selfKey = env.selfSponsorKey ? Ed25519Keypair.fromSecretKey(env.selfSponsorKey) : null;
  const selfAddress = selfKey?.toSuiAddress();
  const client = createSuiClient(env.umbra);
  const recent = new Map<string, number[]>();
  /** gas budgets accepted in the last 24h: [timestamp, budget] */
  let spent: [number, bigint][] = [];

  /** Reserve `budget` against the rolling daily cap; false if it would exceed it.
   *  Counts the full budget (the most a tx can cost), not the gas actually used. */
  const reserveDaily = (budget: bigint): boolean => {
    const now = Date.now();
    spent = spent.filter(([t]) => now - t < DAY_MS);
    const total = spent.reduce((sum, [, b]) => sum + b, 0n);
    if (total + budget > env.selfSponsorDailyBudget) return false;
    spent.push([now, budget]);
    return true;
  };

  const rateLimited = (sender: string): boolean => {
    const now = Date.now();
    const hits = (recent.get(sender) ?? []).filter((t) => now - t < SELF_WINDOW_MS);
    if (hits.length >= SELF_LIMIT) return true;
    hits.push(now);
    recent.set(sender, hits);
    return false;
  };

  const addressOwners = async (objectIds: string[]): Promise<(string | null)[]> => {
    const { objects } = await client.core.getObjects({ objectIds });
    return objects.map((o) => {
      if (o instanceof Error) return null;
      if (o.owner.$kind === "AddressOwner") return o.owner.AddressOwner;
      if (o.owner.$kind === "ConsensusAddressOwner") return o.owner.ConsensusAddressOwner.owner;
      return null;
    });
  };

  app.get("/sponsor/self", (c) => {
    if (!selfAddress) return c.json({ error: "self sponsor not configured (set SPONSOR_SECRET_KEY)" }, 503);
    return c.json({ sponsorAddress: selfAddress, maxGasBudget: env.selfSponsorMaxGasBudget.toString() });
  });

  app.post("/sponsor/self", async (c) => {
    if (!selfKey || !selfAddress) return c.json({ error: "self sponsor not configured (set SPONSOR_SECRET_KEY)" }, 503);
    const { txBytes, signature } = await c.req.json<{ txBytes?: string; signature?: string }>();
    if (!txBytes || !signature) return c.json({ error: "txBytes and signature are required" }, 400);

    let bytes: Uint8Array;
    let sender = "?";
    try {
      bytes = fromBase64(txBytes);
      const data = Transaction.from(bytes).getData();
      sender = data.sender ?? "?";
      if (rateLimited(sender)) return c.json({ error: "too many sponsored transactions, try again later" }, 429);
      await checkSelfSponsorable(data, {
        sponsorAddress: selfAddress,
        allowedMoveCallTargets: allowed,
        maxGasBudget: env.selfSponsorMaxGasBudget,
        getAddressOwners: addressOwners,
      });
      if (!reserveDaily(BigInt(data.gasData.budget ?? 0))) {
        console.error(`[sponsor/self] DAILY CAP reached sender=${sender}`);
        return c.json({ error: "sponsor daily budget reached, try again later" }, 429);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid transaction";
      const status = err instanceof SponsorPolicyError ? 403 : 400;
      console.error(`[sponsor/self] REJECT sender=${sender} msg=${message}`);
      return c.json({ error: message }, status);
    }

    try {
      const { signature: sponsorSignature } = await selfKey.signTransaction(bytes);
      const res = await client.core.executeTransaction({ transaction: bytes, signatures: [signature, sponsorSignature] });
      if (res.$kind !== "Transaction") {
        const failed = res.FailedTransaction;
        console.error(`[sponsor/self] FAILED on-chain sender=${sender} digest=${failed.digest}`);
        return c.json({ error: "transaction failed on-chain", digest: failed.digest }, 422);
      }
      console.log(`[sponsor/self] ok sender=${sender} digest=${res.Transaction.digest}`);
      return c.json({ digest: res.Transaction.digest });
    } catch (err) {
      const { status, message } = describeError(err);
      console.error(`[sponsor/self] EXEC FAIL sender=${sender} status=${status} msg=${message}`);
      return c.json({ error: message, status }, status);
    }
  });

  return app;
}
