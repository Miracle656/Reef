/**
 * Enoki sponsor endpoint. Holds the private API key server-side; matches the
 * fetch contract in `@umbra/core`'s `sponsor-client` (`POST /sponsor` and
 * `POST /sponsor/execute`). Move-call targets are locked to our package.
 */
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  createEnokiClient,
  executeSponsoredTransaction,
  messagingAllowedTargets,
  predictAllowedTargets,
  sponsorTransaction,
  umbraAllowedTargets,
} from "@umbra/core/server";
import type { SuiNetwork } from "@umbra/core";
import type { IndexerEnv } from "./config";

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
  // ReeF's own package + DeepBook Predict + Sui Stack Messaging group targets.
  const allowed = [
    ...umbraAllowedTargets(env.umbra.packageId),
    ...predictAllowedTargets(),
    ...messagingAllowedTargets(),
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

  return app;
}
