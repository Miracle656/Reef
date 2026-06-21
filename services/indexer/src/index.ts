import { serve } from "@hono/node-server";
import { loadEnv } from "./config";
import { startPoller } from "./indexer/poller";
import { createServer } from "./server";

const env = loadEnv();
const app = createServer(env);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[indexer] API + sponsor on http://localhost:${info.port} (${env.umbra.network})`);
});

void startPoller(env);
