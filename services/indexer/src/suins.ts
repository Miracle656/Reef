/**
 * SuiNS leaf-subname minting (D-3). The backend owns the parent name and mints
 * `<handle>.<parent>` -> the user's address during onboarding (gasless to the
 * user). Computes the subname now; the on-chain leaf creation via `@mysten/suins`
 * is wired once the parent name is registered + funded on testnet.
 */
import { Hono } from "hono";
import type { IndexerEnv } from "./config";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export function suinsRoutes(env: IndexerEnv): Hono {
  const app = new Hono();

  app.post("/suins/mint", async (c) => {
    const parent = env.suinsParentName;
    if (!parent) return c.json({ error: "SUINS_PARENT_NAME not configured" }, 503);

    const { handle, address } = await c.req.json<{ handle: string; address: string }>();
    if (!HANDLE_RE.test(handle ?? "")) return c.json({ error: "invalid handle" }, 400);
    if (!/^0x[0-9a-fA-F]+$/.test(address ?? "")) return c.json({ error: "invalid address" }, 400);

    const subname = `${handle}.${parent}`;
    // TODO(D-3): mint the leaf subname on-chain with the backend keypair that
    // owns `parent` via @mysten/suins, targeting `address`. Returning the
    // computed name lets onboarding record it now; `minted` flips to true once
    // the SuiNS call is live. See CLAUDE.md.
    return c.json({ subname, minted: false });
  });

  return app;
}
