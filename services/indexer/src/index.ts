import process from "node:process";
import { serve } from "@hono/node-server";
import { loadEnv } from "./config";

// Load services/indexer/.env (Node built-in; no dotenv dep).
try {
  process.loadEnvFile();
} catch {
  /* no .env file — rely on ambient env */
}
import { startPoller } from "./indexer/poller";
import { createServer } from "./server";

const env = loadEnv();
const app = createServer(env);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[indexer] API + sponsor on http://localhost:${info.port} (${env.umbra.network})`);
});

void startPoller(env);
