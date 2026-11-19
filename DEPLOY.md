# Deploying ReeF (testnet)

Two pieces deploy to two different places:

| Piece | Where | Why |
|---|---|---|
| `apps/web` (Next.js) | **Vercel** | Static + serverless, standard Next host |
| `services/indexer` (Hono + Prisma) | **Railway / Render / Fly / any Node host** | Long-running HTTP server **and** a continuous Sui event poller — not serverless-friendly |

The web app talks to the indexer over HTTP (tRPC feed/profile API, the Enoki **sponsor** endpoint, and the image/DeepBook proxies). So deploy the **indexer first**, grab its URL, then point the web app at it.

---

## 1. Indexer → Railway / Render / Fly

It's a pnpm-workspace package, so build/run from the **repo root**.

**Node 22 or newer.** `@mysten/sui` 2.39+ requires it (root `engines.node` is `>=22`). Render and Vercel default to 22+, but check any host that pins an older Node.

**Provision Postgres** (Neon works — already used in dev) and get its connection string.

**Environment variables**
| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `UMBRA_PACKAGE_ID` | ✅ | from `packages/move/deployments/testnet.json` |
| `UMBRA_REGISTRY_ID` | ✅ | same file |
| `ENOKI_PRIVATE_API_KEY` | for gasless | **server-only** Enoki private key (sponsor). Omit → sponsor disabled |
| `SUINS_PARENT_NAME` | optional | e.g. `umbra.sui`; omit → subname minting disabled |
| `DUSDC_FAUCET_SECRET_KEY` | for Predict | **server-only** bech32 `suiprivkey…` of a key funded with **SUI (gas) + dUSDC**. Drips dUSDC to new zkLogin users so Predict mints don't abort. Omit → faucet returns 503 |
| `DUSDC_DRIP_USD` | optional | dUSDC dripped per new address (default `25`) |
| `INDEXER_PORT` | optional | defaults to `3001` (most hosts inject `PORT` — set `INDEXER_PORT=$PORT` if needed) |
| `POLL_INTERVAL_MS` | optional | defaults to `3000` |
| `SUI_GRPC_URL` | optional | gRPC(-web) fullnode, defaults to `https://fullnode.testnet.sui.io:443`. Sui JSON-RPC URLs no longer work. Delete any old `SUI_FULLNODE_URL` |
| `SUI_GRAPHQL_URL` | optional | event ingestion, defaults to `https://graphql.testnet.sui.io/graphql` |
| `WALRUS_RENEWER_SECRET_KEY` | for media | **server-only** `suiprivkey…` of the Walrus blob owner (must match `NEXT_PUBLIC_WALRUS_BLOB_OWNER` on Vercel), funded with **SUI + WAL**. Every 6h extends owned blobs within 7 epochs of expiry to 50 epochs ahead. Omit → renewal disabled and media expires |
| `WALRUS_RENEW_INTERVAL_MS` | optional | defaults to 6h |

**Commands**
```bash
# install (workspace root). --no-frozen-lockfile because the mobile app's
# package.json is intentionally not committed, so the lockfile can be ahead of it.
pnpm install --no-frozen-lockfile
# generate client + apply schema to the DB (first deploy / migrations)
pnpm --filter @umbra/indexer db:generate
pnpm --filter @umbra/indexer exec prisma migrate deploy   # or: db:push for a fresh DB
# start (server + poller)
pnpm --filter @umbra/indexer start
```
CORS is already open (`app.use("*", cors())`), so the Vercel origin can call it.

---

## 2. Web → Vercel

1. **New Project** → import `github.com/Miracle656/Reef`.
2. **Root Directory: `apps/web`** (this is the key monorepo setting — Vercel installs at the workspace root and builds the app). `apps/web/vercel.json` pins the framework + build command (it runs `prisma generate` so the tRPC `AppRouter` type resolves on a clean build).
3. **Environment Variables** (see `apps/web/.env.example` — all are `NEXT_PUBLIC_*`, safe to expose):
   - `NEXT_PUBLIC_SUI_NETWORK=testnet`
   - `NEXT_PUBLIC_UMBRA_PACKAGE_ID`, `NEXT_PUBLIC_UMBRA_REGISTRY_ID`
   - `NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `NEXT_PUBLIC_INDEXER_URL` = the indexer URL from step 1
   - `NEXT_PUBLIC_SPONSOR_API_URL` = `<indexer URL>/sponsor`
   - `NEXT_PUBLIC_WALRUS_BLOB_OWNER` = the address whose key the indexer holds as `WALRUS_RENEWER_SECRET_KEY` (so uploaded media can be renewed)
   - `NEXT_PUBLIC_WALLET_NETWORK` (optional) = `testnet` or `mainnet` to switch on the wallet at `/wallet`; leave it unset for no wallet. It needs no indexer and no sponsor: USDC and USDSUI are sent with Sui's gasless stablecoin transfers. For `mainnet`, first enable **Mainnet** on the Enoki **public** API key in the Enoki portal. Without that, Google sign-in can't sign on mainnet, so users can receive money but the Send panel says sending isn't switched on. Rehearse on `testnet` first with free test USDC from https://faucet.circle.com.
4. **Deploy.**

### Cash-out to naira (optional)

`/wallet` can turn USDC / USDSUI into naira in a Nigerian bank account through Linq's offramp API. The server side runs in the web app itself (`apps/web/app/api/cashout` and `/api/webhooks/linq`), so it needs **no indexer**. ReeF never holds the money: the wallet sends the dollars straight to a one-time address Linq gives each order.

These variables are **server-side**: set them in Vercel **without** a `NEXT_PUBLIC_` prefix. The Linq key must never reach the browser.

| Var | Needed for | What |
|---|---|---|
| `DATABASE_URL` | both modes | Postgres (the Neon database is fine). Holds the `CashoutOrder` table, which is created automatically on first use. It is also in `services/indexer/prisma/schema.prisma`, so `pnpm db:push` keeps it |
| `CASHOUT_MODE=mock` | rehearsal | No Linq, no bank, no real payout. Use it with `NEXT_PUBLIC_WALLET_NETWORK=testnet` to run the whole flow with test USDC |
| `CASHOUT_MOCK_DEPOSIT_ADDRESS` | rehearsal | Where rehearsal deposits are sent. Use an address you control, so the test USDC isn't lost |
| `LINQ_API_KEY` | live | Linq B2B API key. Live mode needs `NEXT_PUBLIC_WALLET_NETWORK=mainnet`: Linq has no test network, every order is real |
| `LINQ_WEBHOOK_SECRET` | live (recommended) | Verifies Linq's webhooks. Without it webhooks are refused and status comes only from polling, which still works |
| `LINQ_BASE_URL` | optional | Override Linq's base URL |
| `CASHOUT_MIN_USD` / `CASHOUT_MAX_USD` | optional | Per-order limits, default `1` and `500` |

**Rehearse first.** Set `NEXT_PUBLIC_WALLET_NETWORK=testnet`, `CASHOUT_MODE=mock`, `CASHOUT_MOCK_DEPOSIT_ADDRESS` and `DATABASE_URL`, redeploy, get test USDC from https://faucet.circle.com, then use **Cash out** in the wallet. A banner says it is a rehearsal. Any account number works; one ending `0000` rehearses "account not found".

**Going live.**
1. When you sign up with Linq (`POST /b2b/signup`), register the webhook URL `https://<your domain>/api/webhooks/linq`. Their guide has no way to change it later.
2. Enable Mainnet on the Enoki public key and set `NEXT_PUBLIC_WALLET_NETWORK=mainnet` (see the wallet variable above).
3. Remove `CASHOUT_MODE`, set `LINQ_API_KEY` and `LINQ_WEBHOOK_SECRET`, redeploy.
4. Do one small real cash-out yourself before telling anyone. In particular confirm Linq sees the deposit: the wallet pays with a gasless transfer, which lands in the deposit address's **address balance**, not as a separate coin object.

Limits built in: every request is signed by the wallet that owns the order; 3 new orders per 10 minutes and 20 per day per wallet (Linq allows our whole key 10 a minute); `$1` to `$500` per order by default. Check a deployment in rehearsal mode with `pnpm --filter @umbra/indexer cashout:smoke https://<your domain> <LINQ_WEBHOOK_SECRET>`; it refuses to run against a live one.

### After deploy — whitelist the domain (or sign-in fails)
- **Enoki dev portal:** add the Vercel domain (and any preview domains) to the app's allowed origins.
- **Google OAuth client:** add the domain to **Authorized JavaScript origins** / redirect URIs.

---

## Notes
- **The social app is testnet only** — never point it at mainnet in Phase 1. The wallet and cash-out are the exception: they follow `NEXT_PUBLIC_WALLET_NETWORK`.
- The `ENOKI_PRIVATE_API_KEY` must **only** ever live on the indexer service, never in the web env. The web app's only secrets are the cash-out ones above (`LINQ_API_KEY`, `LINQ_WEBHOOK_SECRET`, `DATABASE_URL`), all server-side.
- The indexer's poller ingests on-chain events continuously; if it can't reach Postgres the feed/profile/trending data will be empty (the API still serves). Neon free-tier auto-suspends — the first request after idle may be slow while it wakes.
