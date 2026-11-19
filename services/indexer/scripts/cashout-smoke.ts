/**
 * End-to-end check of the cash-out HTTP API in REHEARSAL mode (no Linq, no bank,
 * no real money). It signs requests with a throwaway key and drives a running
 * web server through a whole order: account lookup, create, deposit, status,
 * list, the webhook, and the refusals that must happen.
 *
 * Start the web app in rehearsal mode first, then run this against it:
 *
 *   cd apps/web && NEXT_PUBLIC_WALLET_NETWORK=testnet CASHOUT_MODE=mock \
 *     CASHOUT_MOCK_DEPOSIT_ADDRESS=0x<an address you control> \
 *     LINQ_WEBHOOK_SECRET=whsec_local_test pnpm exec next dev -p 3100
 *
 *   pnpm --filter @umbra/indexer cashout:smoke http://localhost:3100 whsec_local_test
 *
 * It refuses to run against a server that isn't in rehearsal mode.
 */
import { createHmac, randomUUID } from "node:crypto";
import process from "node:process";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { cashout } from "@umbra/core";

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/+$/, "");
const webhookSecret = process.argv[3];

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

const user = new Ed25519Keypair();
const stranger = new Ed25519Keypair();
const owner = user.toSuiAddress();

type Unsigned<T> = T extends unknown ? Omit<T, "owner" | "timestamp"> : never;

async function call(signer: Ed25519Keypair, m: Unsigned<cashout.CashoutMessage>, as = signer.toSuiAddress(), timestamp = Date.now()) {
  const message = { ...m, owner: as, timestamp } as cashout.CashoutMessage;
  const { signature } = await signer.signPersonalMessage(cashout.canonicalCashoutBytes(message));
  const res = await fetch(`${base}/api/cashout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const info = (await (await fetch(`${base}/api/cashout`)).json()) as Record<string, any>;
console.log("GET /api/cashout ->", JSON.stringify(info));
if (!info.available || info.mode !== "mock") {
  console.error("This server isn't in rehearsal mode (CASHOUT_MODE=mock). Not running: a live server would create real Linq orders.");
  process.exit(2);
}
check("reports availability, limits and a rate", info.network === "testnet" && info.minCents === "100" && info.maxCents === "50000" && info.rate === 1500 && info.coins.includes("usdc"));

// --- account lookup
let r = await call(user, { action: "verify-bank", bankCode: "033", accountNumber: "1234567890" });
check("looks up the account name", r.status === 200 && /TEST/.test(r.body.account?.accountName), JSON.stringify(r.body));
r = await call(user, { action: "verify-bank", bankCode: "033", accountNumber: "1234560000" });
check("says so when the account doesn't exist", r.status === 400 && /couldn't find that account/.test(r.body.error), r.body.error);

// --- refusals
const orderId = randomUUID();
const create = { action: "create" as const, orderId, coin: "usdc" as const, amountKind: "ngn" as const, amount: "3000", bankCode: "033", accountNumber: "1234567890" };
r = await call(stranger, create, owner);
check("rejects a request signed by another wallet", r.status === 401, r.body.error);
r = await call(user, create, owner, Date.now() - 6 * 60_000);
check("rejects a stale request", r.status === 401, r.body.error);
r = await call(user, { ...create, amount: "100" });
check("enforces the minimum", r.status === 400 && r.body.code === "limit", r.body.error);
let raw = await fetch(`${base}/api/cashout`, { method: "POST", body: "{not json" });
check("rejects a body that isn't JSON", raw.status === 400);
raw = await fetch(`${base}/api/cashout`, { method: "POST", body: JSON.stringify({ message: { action: "list" }, signature: "x".repeat(20_000) }) });
check("rejects an oversized body", raw.status === 400);

// --- create
r = await call(user, create);
const order = r.body.order as cashout.CashoutOrderView;
check(
  "creates an order: 3000 naira at 1500 = 2.00 dollars to the rehearsal address",
  r.status === 200 && order?.status === "awaiting_deposit" && order.amountStable === "2000000" && order.amountNgn === "3000.00" && order.accountNumberMasked === "******7890" && order.depositAddress.length === 66,
  JSON.stringify(r.body),
);
r = await call(user, create);
check("a repeat of the same request returns the same order", r.status === 200 && r.body.order?.id === orderId && r.body.order?.depositAddress === order.depositAddress);
r = await call(stranger, { action: "get", orderId });
check("another wallet can't read the order", r.status === 404, r.body.error);
r = await call(stranger, { ...create });
check("another wallet can't reuse the order id", r.status === 404, r.body.error);

// --- follow it
r = await call(user, { action: "get", orderId });
check("the owner reads it back, still awaiting the deposit", r.status === 200 && r.body.order?.status === "awaiting_deposit");
const digest = "9UaN13guxdbdKgTEe6KGLYMd2RPQQDETFEvx4PFrogL5";
r = await call(user, { action: "deposit", orderId, digest });
check("records the deposit transaction", r.status === 200 && r.body.order?.depositDigest === digest, JSON.stringify(r.body.order?.status));
await new Promise((res) => setTimeout(res, 4500));
r = await call(user, { action: "get", orderId });
check("then shows the payout in progress", r.status === 200 && r.body.order?.status === "processing", r.body.order?.status);
r = await call(user, { action: "list" });
check("lists the order for its owner only", r.status === 200 && r.body.orders?.length === 1 && r.body.orders[0].id === orderId);
r = await call(stranger, { action: "list" });
check("and not for anyone else", r.status === 200 && r.body.orders?.length === 0);

// --- webhook
if (webhookSecret) {
  const event = JSON.stringify({ event: "order.completed", orderId: `mock-${orderId}`, amountStableCoin: 2, amountNGN: 3000, status: "Settled in treasury" });
  const sig = (body: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  let w = await fetch(`${base}/api/webhooks/linq`, { method: "POST", headers: { "X-Linq-Signature": sig(event, "wrong-secret") }, body: event });
  check("refuses a webhook signed with the wrong secret", w.status === 401);
  w = await fetch(`${base}/api/webhooks/linq`, { method: "POST", body: event });
  check("refuses a webhook with no signature", w.status === 401);
  r = await call(user, { action: "get", orderId });
  check("a refused webhook changes nothing", r.body.order?.status === "processing", r.body.order?.status);
  w = await fetch(`${base}/api/webhooks/linq`, { method: "POST", headers: { "X-Linq-Signature": sig(event, webhookSecret) }, body: event });
  check("accepts a correctly signed webhook", w.status === 200);
  r = await call(user, { action: "get", orderId });
  check("which marks the order paid", r.body.order?.status === "paid", r.body.order?.status);
} else {
  console.log("SKIP  webhook checks (pass the server's LINQ_WEBHOOK_SECRET as the second argument)");
}

// --- throttle: 3 orders per 10 minutes per wallet (one made above)
for (let i = 0; i < 2; i++) await call(user, { ...create, orderId: randomUUID() });
r = await call(user, { ...create, orderId: randomUUID() });
check("stops a 4th order within 10 minutes", r.status === 429, r.body.error);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
