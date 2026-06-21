import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import type { AppRouter } from "@umbra/indexer/router";
import { INDEXER_URL } from "./config";

/** Typed tRPC client to the indexer feed/profile/graph API. */
export const trpc: TRPCClient<AppRouter> = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${INDEXER_URL}/trpc` })],
});
