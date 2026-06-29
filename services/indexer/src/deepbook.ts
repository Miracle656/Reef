import { Hono } from "hono";
import { testnetCoins, testnetPools, type DeepBookCompatibleClient } from "@mysten/deepbook-v3";
import { createSuiClient, deepbook } from "@umbra/core";
import type { IndexerEnv } from "./config";

/**
 * DeepBook reads (order book + mid) run here, NOT on the device: @mysten/sui's
 * jsonRpc effect-parsing crashes under React Native's Metro/Hermes (circular
 * module init), but works fine in Node. Mobile fetches these as plain JSON.
 */
const SULTAN = {
  packageId: "0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b",
  type: "0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b::creator_coin::CREATOR_COIN",
  scalar: 1_000_000_000,
} as const;
const SULTAN_POOL_ID = "0xa642193580f83b979fda6e3bcb765cfa15bfaeba3227f059bed124631a1e29f8";
const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

const COINS = { ...testnetCoins, SULTAN: { address: SULTAN.packageId, type: SULTAN.type, scalar: SULTAN.scalar } };
const POOLS = { ...testnetPools, SULTAN_DEEP: { address: SULTAN_POOL_ID, baseCoin: "SULTAN", quoteCoin: "DEEP" } };

export function deepbookRoutes(env: IndexerEnv): Hono {
  const app = new Hono();
  const client = createSuiClient(env.umbra);
  const db = deepbook.createDeepBookClient({
    client: client as unknown as DeepBookCompatibleClient,
    address: ZERO,
    coins: COINS,
    pools: POOLS,
  });

  app.get("/deepbook/orderbook/:poolKey", async (c) => {
    const poolKey = c.req.param("poolKey");
    try {
      return c.json(await deepbook.getOrderBook(db, poolKey));
    } catch {
      return c.json({ mid: 0, bids: [], asks: [] });
    }
  });

  return app;
}
