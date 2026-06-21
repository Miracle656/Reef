/**
 * Enoki sponsor endpoint. Holds the private API key server-side; matches the
 * fetch contract in `@umbra/core`'s `sponsor-client` (`POST /sponsor` and
 * `POST /sponsor/execute`). Move-call targets are locked to our package.
 */
import { Hono } from "hono";
import {
  createEnokiClient,
  executeSponsoredTransaction,
  sponsorTransaction,
  umbraAllowedTargets,
} from "@umbra/core/server";
import type { SuiNetwork } from "@umbra/core";
import type { IndexerEnv } from "./config";

export function sponsorRoutes(env: IndexerEnv): Hono {
  const app = new Hono();
  const enoki = env.enokiApiKey ? createEnokiClient(env.enokiApiKey) : null;
  const allowed = umbraAllowedTargets(env.umbra.packageId);

  app.post("/sponsor", async (c) => {
    if (!enoki) return c.json({ error: "sponsor not configured (set ENOKI_PRIVATE_API_KEY)" }, 503);
    const body = await c.req.json<{ transactionKindBytes: string; sender: string; network?: SuiNetwork }>();
    const res = await sponsorTransaction(enoki, {
      network: body.network ?? env.umbra.network,
      transactionKindBytes: body.transactionKindBytes,
      sender: body.sender,
      allowedMoveCallTargets: allowed,
    });
    return c.json(res);
  });

  app.post("/sponsor/execute", async (c) => {
    if (!enoki) return c.json({ error: "sponsor not configured" }, 503);
    const { digest, signature } = await c.req.json<{ digest: string; signature: string }>();
    const res = await executeSponsoredTransaction(enoki, { digest, signature });
    return c.json(res);
  });

  return app;
}
