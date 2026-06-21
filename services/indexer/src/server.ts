import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import type { IndexerEnv } from "./config";
import { sponsorRoutes } from "./sponsor";
import { suinsRoutes } from "./suins";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/trpc";

export function createServer(env: IndexerEnv): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok", network: env.umbra.network }));

  app.use(
    "/trpc/*",
    trpcServer({ endpoint: "/trpc", router: appRouter, createContext: () => createContext() }),
  );

  app.route("/", sponsorRoutes(env));
  app.route("/", suinsRoutes(env));

  return app;
}
