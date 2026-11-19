/**
 * Cash-out API.
 *
 *   GET  /api/cashout   is cash-out available here, its limits, and today's indicative rate
 *   POST /api/cashout   one signed request: { message, signature } (see @umbra/core `cashout`)
 *
 * Every POST is a personal message signed by the wallet that owns the order;
 * the rules (who may do what, limits, checks on Linq's answers) are in
 * `@umbra/core/server` `createCashoutService`.
 */
import { CashoutError } from "@umbra/core/server";
import { getCashout } from "@/lib/server/cashout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Creating an order makes two calls to Linq, each with retries. Give it room,
// so a slow provider doesn't cut the function off halfway. (If it ever is cut
// off, the client's retry carries the same order id and gets the same order.)
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
/** A signed request is 1-3 KB (a zkLogin or passkey signature is the bulk of it); refuse anything that clearly isn't one. */
const MAX_BODY_BYTES = 16_384;

export async function GET() {
  const c = await getCashout();
  if (!c.ok) return Response.json({ available: false, reason: c.reason }, { headers: NO_STORE });
  // The rate is only an estimate for the form; cash-out still works without it.
  const rate = await c.service.rate().catch(() => null);
  return Response.json({ available: true, ...c.info, rate: rate?.rate ?? null, rateAtMs: rate?.atMs ?? null }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const c = await getCashout();
  if (!c.ok) return Response.json({ error: c.reason, code: "unavailable" }, { status: 503, headers: NO_STORE });

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "That request isn't valid.", code: "bad_request" }, { status: 400, headers: NO_STORE });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "That request isn't valid.", code: "bad_request" }, { status: 400, headers: NO_STORE });
  }

  try {
    return Response.json(await c.service.handle(body), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof CashoutError) return Response.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    console.error("[cashout] unexpected error:", e instanceof Error ? e.stack ?? e.message : e);
    return Response.json({ error: "Something went wrong on our side. If you already sent money, it is safe: check the order again in a minute.", code: "provider" }, { status: 500, headers: NO_STORE });
  }
}
