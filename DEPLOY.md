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
4. **Deploy.**

### After deploy — whitelist the domain (or sign-in fails)
- **Enoki dev portal:** add the Vercel domain (and any preview domains) to the app's allowed origins.
- **Google OAuth client:** add the domain to **Authorized JavaScript origins** / redirect URIs.

---

## Notes
- **Testnet only** — never point these at mainnet in Phase 1.
- The `ENOKI_PRIVATE_API_KEY` must **only** ever live on the indexer service, never in the web env.
- The indexer's poller ingests on-chain events continuously; if it can't reach Postgres the feed/profile/trending data will be empty (the API still serves). Neon free-tier auto-suspends — the first request after idle may be slow while it wakes.
