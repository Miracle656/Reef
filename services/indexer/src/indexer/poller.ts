/**
 * Event poller. We page through each MoveModule's events over Sui GraphQL with
 * a persisted cursor rather than streaming raw checkpoints — simpler and
 * sufficient for Phase 1 volumes, and the cursor makes ingestion resumable/
 * idempotent. (GraphQL replaced JSON-RPC `queryEvents`, which Sui shut off in
 * 2026; gRPC has no event query.)
 */
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { prisma } from "../db";
import type { IndexerEnv } from "../config";
import { applyEvent, normalizeEvent } from "./handlers";
import { applySavingsEvent, normalizeSavingsEvent } from "./savings";

const MODULES = ["profile", "post", "follow"] as const;
const PAGE = 50;

/**
 * Cursors live in the `txDigest` column, tagged `eventSeq = "gql"`. A row
 * without the tag is a leftover JSON-RPC cursor: ignore it and re-ingest from
 * the start (every handler is an upsert/update, so a replay is safe).
 */
const GQL_TAG = "gql";

const EVENTS_QUERY = `
  query Events($module: String!, $after: String, $first: Int!) {
    events(first: $first, after: $after, filter: { module: $module }) {
      pageInfo { hasNextPage endCursor }
      nodes { contents { type { repr } json } }
    }
  }
`;

type EventsResult = {
  events: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: { contents: { type: { repr: string }; json: unknown } | null }[];
  };
};

async function loadCursor(module: string): Promise<string | null> {
  const row = await prisma.ingestCursor.findUnique({ where: { module } });
  return row?.eventSeq === GQL_TAG ? row.txDigest : null;
}

async function saveCursor(module: string, cursor: string): Promise<void> {
  await prisma.ingestCursor.upsert({
    where: { module },
    create: { module, txDigest: cursor, eventSeq: GQL_TAG },
    update: { txDigest: cursor, eventSeq: GQL_TAG },
  });
}

// Savings (#15) needs each event's tx digest + sequence (ledger key) and time.
const SAVINGS_EVENTS_QUERY = `
  query SavingsEvents($module: String!, $after: String, $first: Int!) {
    events(first: $first, after: $after, filter: { module: $module }) {
      pageInfo { hasNextPage endCursor }
      nodes { sequenceNumber timestamp transaction { digest } contents { type { repr } json } }
    }
  }
`;

type SavingsEventsResult = {
  events: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      sequenceNumber: number;
      timestamp: string | null;
      transaction: { digest: string } | null;
      contents: { type: { repr: string }; json: unknown } | null;
    }[];
  };
};

/** Ingest `reef_savings::savings` events (separate package, own cursor). */
async function pollSavings(gql: SuiGraphQLClient, packageId: string): Promise<number> {
  const key = `savings:${packageId}`;
  let cursor = await loadCursor(key);
  let hasNext = true;
  let total = 0;
  while (hasNext) {
    const res = await gql.query<SavingsEventsResult>({
      query: SAVINGS_EVENTS_QUERY,
      variables: { module: `${packageId}::savings`, after: cursor, first: PAGE },
    });
    if (res.errors?.length) throw new Error(`GraphQL: ${res.errors.map((e) => e.message).join("; ")}`);
    const page = res.data!.events;
    for (const n of page.nodes) {
      if (!n.contents || !n.transaction) continue;
      const ev = normalizeSavingsEvent(n.contents.type.repr, n.contents.json, {
        digest: n.transaction.digest,
        sequenceNumber: n.sequenceNumber,
        timestampMs: n.timestamp ? Date.parse(n.timestamp) : 0,
      });
      if (ev) {
        await applySavingsEvent(prisma, ev);
        total += 1;
      }
    }
    if (page.nodes.length > 0 && page.pageInfo.endCursor) {
      cursor = page.pageInfo.endCursor;
      await saveCursor(key, cursor);
    }
    hasNext = page.pageInfo.hasNextPage && page.nodes.length > 0;
  }
  return total;
}

export async function pollOnce(env: IndexerEnv): Promise<number> {
  const gql = new SuiGraphQLClient({ url: env.graphqlUrl, network: env.umbra.network });
  let total = 0;

  for (const module of MODULES) {
    let cursor = await loadCursor(module);
    let hasNext = true;
    while (hasNext) {
      const res = await gql.query<EventsResult>({
        query: EVENTS_QUERY,
        variables: { module: `${env.umbra.packageId}::${module}`, after: cursor, first: PAGE },
      });
      if (res.errors?.length) throw new Error(`GraphQL: ${res.errors.map((e) => e.message).join("; ")}`);
      const page = res.data!.events;
      for (const node of page.nodes) {
        if (!node.contents) continue;
        const name = node.contents.type.repr.split("::").pop() ?? "";
        const normalized = normalizeEvent(name, node.contents.json);
        if (normalized) {
          await applyEvent(prisma, normalized);
          total += 1;
        }
      }
      if (page.nodes.length > 0 && page.pageInfo.endCursor) {
        cursor = page.pageInfo.endCursor;
        await saveCursor(module, cursor);
      }
      hasNext = page.pageInfo.hasNextPage && page.nodes.length > 0;
    }
  }
  if (env.savingsPackageId) total += await pollSavings(gql, env.savingsPackageId);
  return total;
}

export async function startPoller(env: IndexerEnv): Promise<void> {
  const tick = async () => {
    try {
      const n = await pollOnce(env);
      if (n > 0) console.log(`[indexer] ingested ${n} events`);
    } catch (err) {
      console.error("[indexer] poll error:", err);
    }
  };
  await tick();
  setInterval(tick, env.pollIntervalMs);
}
