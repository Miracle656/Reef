/**
 * Linq webhook receiver: POST /api/webhooks/linq
 *
 * Linq calls this when an order changes state. The body is verified against
 * `X-Linq-Signature` (HMAC-SHA256 with LINQ_WEBHOOK_SECRET) BEFORE it is parsed,
 * so the raw text is read, never `req.json()`.
 *
 * Linq sends each event once and never retries, so this is an accelerator, not
 * the source of truth: the app also asks for an order's status directly.
 */
import { getCashout } from "@/lib/server/cashout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const c = await getCashout();
  if (!c.ok) return new Response("cash-out unavailable", { status: 503 });
  const raw = await req.text();
  const status = await c.service.webhook(raw, req.headers.get("x-linq-signature")).catch((e) => {
    console.error("[cashout] webhook failed:", e instanceof Error ? e.message : e);
    return 500;
  });
  return new Response(status === 200 ? "ok" : "rejected", { status });
}
