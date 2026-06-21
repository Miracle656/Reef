/**
 * Event poller. We poll `queryEvents` per MoveModule with a persisted cursor
 * rather than streaming raw checkpoints — simpler and sufficient for Phase 1
 * volumes, and the cursor makes ingestion resumable/idempotent. (Justified in
 * CLAUDE.md; can be swapped for full checkpoint streaming later without schema
 * changes.)
 */
import { createSuiClient } from "@umbra/core";
import { prisma } from "../db";
import type { IndexerEnv } from "../config";
import { applyEvent, normalizeEvent } from "./handlers";

const MODULES = ["profile", "post", "follow"] as const;
const PAGE = 50;

type Cursor = { txDigest: string; eventSeq: string } | null;

async function loadCursor(module: string): Promise<Cursor> {
  const row = await prisma.ingestCursor.findUnique({ where: { module } });
  return row ? { txDigest: row.txDigest, eventSeq: row.eventSeq } : null;
}

async function saveCursor(module: string, cursor: Cursor): Promise<void> {
  if (!cursor) return;
  await prisma.ingestCursor.upsert({
    where: { module },
    create: { module, txDigest: cursor.txDigest, eventSeq: cursor.eventSeq },
    update: { txDigest: cursor.txDigest, eventSeq: cursor.eventSeq },
  });
}

export async function pollOnce(env: IndexerEnv): Promise<number> {
  const client = createSuiClient(env.umbra);
  let total = 0;

  for (const module of MODULES) {
    let cursor = await loadCursor(module);
    let hasNext = true;
    while (hasNext) {
      const res = await client.queryEvents({
        query: { MoveModule: { package: env.umbra.packageId, module } },
        cursor,
        order: "ascending",
        limit: PAGE,
      });
      for (const ev of res.data) {
        const name = ev.type.split("::").pop() ?? "";
        const normalized = normalizeEvent(name, ev.parsedJson);
        if (normalized) {
          await applyEvent(prisma, normalized);
          total += 1;
        }
      }
      if (res.data.length > 0) {
        cursor = res.nextCursor as Cursor;
        await saveCursor(module, cursor);
      }
      hasNext = res.hasNextPage && res.data.length > 0;
    }
  }
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
