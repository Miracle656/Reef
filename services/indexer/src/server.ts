import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { IndexerEnv } from "./config";
import { deepbookRoutes } from "./deepbook";
import { imgRoutes } from "./img";
import { sponsorRoutes } from "./sponsor";
import { suinsRoutes } from "./suins";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/trpc";

export function createServer(env: IndexerEnv): Hono {
  const app = new Hono();

  // Allow the web (and Expo) clients to call the API/sponsor cross-origin.
  app.use("*", cors());

  app.get("/health", (c) => c.json({ status: "ok", network: env.umbra.network }));

  app.use(
    "/trpc/*",
    trpcServer({ endpoint: "/trpc", router: appRouter, createContext: () => createContext() }),
  );

  app.route("/", imgRoutes(env));
  app.route("/", deepbookRoutes(env));
  app.route("/", sponsorRoutes(env));
  app.route("/", suinsRoutes(env));

  return app;
}
