# ReeF — project memory / progress

> **ReeF** — a Sui-native decentralized social superapp (Farcaster/Base-app
> equivalent where identity, social graph, content, payments and trading are
> native Sui primitives). Mobile-first, Lagos-first: **walletless + gasless**.
> Codename in code is still `umbra` (`@umbra/*` packages) — a full rename is pending.
> **Testnet only.** Repo: github.com/Miracle656/Reef.

_Last updated: 2026-06-23. Companion to `CLAUDE.md` (architecture + decisions D-1…D-10)._

---

## Status at a glance

| Area | State |
|---|---|
| Move contracts (`profile`/`post`/`follow`/`registry`) | ✅ published to testnet · 16 tests |
| `@umbra/core` (client, bindings, Walrus, Enoki, DeepBook, schemas) | ✅ 12 tests |
| `services/indexer` (tRPC + Prisma + Neon, Enoki sponsor, reactions, links, creator coins) | ✅ 3 tests · running on :3001 |
| `apps/web` (Next 15) | ✅ feature-rich, `next build` clean · running on :3000 |
| `apps/mobile` (Expo) | 🟡 scaffolded; parity pending → see `apps/mobile/CONTRIBUTING.md` + issue #1 |

---

## What works end-to-end (web, on testnet)

- **Walletless sign-in** — Google zkLogin via Enoki (no seed phrase).
- **Gasless everything** — Enoki sponsor endpoint (server-only key) sponsors gas; user signs with zkLogin.
- **Profiles** — claim handle, avatar (auto-pulled from Google → Walrus), bio; one-tx onboarding (profile + follow set). SuiNS subname field reserved.
- **Posts** — text + up to 2 images (Walrus), owned + editable/deletable. Composer: inline quick-post + a Farcaster-style **Cast modal** with image previews + a **Tokenize toggle**.
- **Feed** — own + followed accounts, reverse-chron; auto-refresh + toast after posting.
- **Follow / unfollow**, **Likes** — off-chain signed reactions, **per-user persisted**, Sui-drop icon (grey→blue), toggle.
- **Profile** — your posts + a **Creator coin** card (Trade → market).
- **Wallet binding** (Settings) — link an external Sui wallet (signature-verified, Farcaster-style "verified address").
- **Trade terminal** (`/trade`, Trade mode) — all DeepBook testnet pairs + $SULTAN, icon dropdown, live order book (`get_level2_ticks_from_mid`), live mid-price chart.
- **Predict** (`/trade`, Predict mode) — REAL DeepBook Predict BTC oracle markets, live spot + price-history chart w/ strike, swipe feed, **real on-chain trade "pops"**.
- **Messages** (`/messages`) — placeholder only (Phase 3).
- Design: smooth "liquid neobrutalism", **Sui-blue** accent, frosted glass, big radii.

---

## Architecture

```
packages/move/     Sui Move (profile, post, follow, registry) — published testnet
packages/core/     shared: config, sui client, contract PTB builders, walrus, auth/sponsor-client, deepbook v3, zod schemas
packages/ui/       design tokens (palette, spacing, radius, shadow) + web theme.css
services/indexer/  event poller → Postgres(Neon) via Prisma; tRPC AppRouter (feed/profile/post/graph/reactions/likeState/creatorCoins/linkWallet); Enoki /sponsor; SuiNS mint stub
apps/web/          Next 15 App Router + dapp-kit + Enoki + react-query + tRPC client + lightweight-charts
apps/mobile/       Expo + Expo Router + NativeWind (shares @umbra/core) — parity pending
```
Key: durable state on-chain (profiles/posts/follows); high-frequency low-value (likes) off-chain via the indexer. `@umbra/core` split into client-safe `@umbra/core` vs server-only `@umbra/core/server` (Enoki private key).

---

## Deployed (testnet)

- **Package:** `0x2e066a2176aaaf4e61064b74d3b4d9ea80d10ceca1372a9cd4bda36412ff761f`
- **Registry (shared):** `0x1abe492364bcaff32648a432ca5ca4cf91d9fa0307b4f389ecf1a9c36daad933`
- **$SULTAN coin:** `0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b::creator_coin::CREATOR_COIN`
- **SULTAN/DEEP pool:** `0xa642193580f83b979fda6e3bcb765cfa15bfaeba3227f059bed124631a1e29f8`
- **DeepBook Predict server:** `https://predict-server.testnet.mystenlabs.com` · predict object `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a`
- Build/publish via **WSL `sui`** (Windows client.yaml is broken). Web :3000, indexer :3001.

---

## Next / open work

- **Per-post coin mint engine** (the headline next build): publish a freshly-patched `creator_coin` module via `@mysten/move-bytecode-template` → `tx.publish` → create `<COIN>/DEEP` pool (500 DEEP), signed by the creator's **linked wallet**. Ticker auto-derived from post text. Then show coin on post + profile. Reference: deepmarket `CreateMarketModal` + `api.ts`.
- **DeepBook trade execution** — BalanceManager + `placeLimitOrder` via linked wallet (terminal trade panel is a shell).
- **Predict mint** — open PredictManager + mint up/down with DUSDC (feed is read-only).
- **Walrus durability** — switch uploads to the Walrus SDK (own the Blob) + a renewal job (extend epochs, pay WAL). Currently public-publisher, 30 epochs, no renewal.
- **Mobile parity** — port web features to Expo (issue #1 + `apps/mobile/CONTRIBUTING.md`).
- **Rename** `umbra` → `ReeF` across packages/wordmark/handles.
- Optional: SUI **balance card** on profile; on-chain SuiNS leaf-subname mint (needs `umbra.sui` parent).

---

## How to run / verify

```bash
pnpm install
pnpm move:test                         # 16 Move tests
pnpm --filter @umbra/core test         # 12 core tests
pnpm --filter @umbra/indexer dev       # tRPC API + sponsor + poller (needs DATABASE_URL, ENOKI_PRIVATE_API_KEY)
pnpm --filter web dev                  # web on :3000
pnpm --filter mobile start             # Expo
```
Secrets live only in gitignored `.env` / `.env.local` (web public keys, indexer Enoki private key + Neon URL). Only `.env.example` is committed.
