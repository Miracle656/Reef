import { Hono } from "hono";
import type { IndexerEnv } from "./config";

/**
 * Image proxy. Walrus' aggregator serves blobs with no Content-Type, and mobile
 * clients may not have direct internet to Walrus — but they can always reach the
 * indexer. So the server fetches the blob and re-serves it with a sniffed image
 * Content-Type that React Native's <Image> will decode.
 */
function sniff(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return "image/webp";
  return "image/jpeg"; // jpeg (ff d8) + default
}

export function imgRoutes(env: IndexerEnv): Hono {
  const app = new Hono();
  const aggregators = env.umbra.walrus.aggregators;

  app.get("/img/:blobId", async (c) => {
    const blobId = c.req.param("blobId");
    for (const base of aggregators) {
      try {
        const r = await fetch(`${base.replace(/\/$/, "")}/${blobId}`);
        if (!r.ok) continue;
        const buf = new Uint8Array(await r.arrayBuffer());
        return c.body(buf, 200, {
          "Content-Type": sniff(buf),
          "Cache-Control": "public, max-age=31536000, immutable",
        });
      } catch {
        // try next aggregator
      }
    }
    return c.text("blob not found", 404);
  });

  return app;
}
