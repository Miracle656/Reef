/**
 * GET /api/prices: what SUI is worth in dollars, so the wallet can show a
 * total that includes it.
 *
 *   { "sui": "652900" }   millionths of a dollar per SUI, or null if it can't be read
 *
 * The price is read from DeepBook's on-chain SUI/USDC order book through the
 * wallet's own Sui node: no price service, no API key. It is served from here
 * rather than read in the browser so that phones don't have to download the
 * DeepBook SDK just to see a balance, and so every visitor shares one read:
 * the CDN keeps each answer for half a minute.
 *
 * Display only. Nothing that moves money is worked out from this number.
 */
import { createSuiClient } from "@umbra/core";
import { readSuiUsdPrice } from "@umbra/core/server";
import { walletConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** Fresh for 30 seconds; after that the CDN may hand out the old answer while it fetches a new one. */
const KEEP = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" };
/** No price: ask again soon. */
const RETRY_SOON = { "Cache-Control": "public, s-maxage=5" };
const READ_TIMEOUT_MS = 8_000;

const client = walletConfig ? createSuiClient(walletConfig) : null;

export async function GET() {
  if (!client || !walletConfig) return Response.json({ sui: null }, { headers: KEEP });
  try {
    const price = await Promise.race([
      readSuiUsdPrice(client, walletConfig.network),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_TIMEOUT_MS)),
    ]);
    return Response.json({ sui: price === null ? null : price.toString() }, { headers: price === null ? RETRY_SOON : KEEP });
  } catch (e) {
    console.error("[prices] couldn't read SUI's price:", e instanceof Error ? e.message : e);
    return Response.json({ sui: null }, { headers: RETRY_SOON });
  }
}
