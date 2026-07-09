# ReeF Mobile — contributor guide

You're picking up the **Expo (React Native) app** for ReeF, a Sui-native social
superapp (codename in code is still `umbra`). The **web app is the reference
implementation** — your job is to bring the mobile app to parity with it,
reusing the shared logic. This guide maps everything that exists.

> TL;DR: All business logic lives in **`@umbra/core`** and the **indexer's tRPC
> API**. The mobile app is a thin RN UI over those. Mirror the web app's
> screens; don't reinvent the on-chain/data layer.

---

## 1. The monorepo (what you can reuse)

```
packages/move/        Sui Move contracts (published to testnet — see deployments/testnet.json)
packages/core/        ★ shared logic — IMPORT THIS, don't duplicate
  ├─ config           UmbraConfig, testnet defaults, Walrus endpoints
  ├─ sui/client       createSuiClient (SuiJsonRpcClient)
  ├─ contracts/       PTB builders: create_profile, onboard, create_post, follow, edit/delete
  ├─ walrus/          uploadBlob / urlFor / readBlob (HTTP publisher)
  ├─ auth/sponsor-client   gasless flow: buildKindBytes → sponsor → sign → execute
  ├─ deepbook/        DeepBook v3 wrapper (pool create, order book, place order)
  └─ schemas/         Zod schemas (events, Post/Profile, reactions, wallet-link)
packages/ui/          design tokens (palette light/dark, spacing, radius, shadow) — tokens.ts
services/indexer/     ★ tRPC API + Postgres + Enoki sponsor + Predict-adjacent.
  └─ src/trpc/router  AppRouter (import the TYPE in mobile for a typed tRPC client)
apps/web/             ★ REFERENCE UI — read these components, port to RN
apps/mobile/          ← you are here (Expo + Expo Router + NativeWind)
```

**Golden rule:** anything that touches Sui/Walrus/Enoki/DeepBook or data is
already in `@umbra/core` or the indexer. The web app's `apps/web/lib/*` shows
the wiring patterns (config from `EXPO_PUBLIC_*`, the gasless hook, the typed
tRPC client). Port those, swap web primitives for RN.

---

## 2. Current state of the mobile app

Already scaffolded + typechecking (`pnpm --filter mobile typecheck`):
- Expo Router, NativeWind v4, shares `@umbra/core`.
- **Auth**: `lib/auth.tsx` — Enoki **zkLogin** via `EnokiFlow` + `expo-web-browser` + `expo-auth-session` (custom scheme `umbra://`).
- **Gasless**: `lib/gasless.ts` — `sponsorAndExecute` signed by the zkLogin keypair.
- Screens: `app/index.tsx` (feed + compose), `app/onboarding.tsx`, `app/u/[handle].tsx` (profile + follow).
- `lib/trpc.ts` typed client → indexer; `lib/media.ts` image pick → Walrus.
- `components/ui.tsx` (RN neobrutalist primitives), `components/post-card.tsx`.

It has NOT been updated with the features the web app gained later (see §4).

---

## 3. Run it

```bash
pnpm install
# env: copy the EXPO_PUBLIC_* vars into apps/mobile/.env (see root .env.example)
pnpm --filter mobile start         # Expo dev server; press i / a, or scan in Expo Go
```

Required `EXPO_PUBLIC_*` env (mirror the web `.env.local` values):
`EXPO_PUBLIC_SUI_NETWORK=testnet`, `EXPO_PUBLIC_UMBRA_PACKAGE_ID`,
`EXPO_PUBLIC_UMBRA_REGISTRY_ID`, `EXPO_PUBLIC_ENOKI_PUBLIC_API_KEY`,
`EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_INDEXER_URL`, `EXPO_PUBLIC_SPONSOR_API_URL`.

Backend: run the indexer (`pnpm --filter @umbra/indexer dev`, needs `DATABASE_URL` + `ENOKI_PRIVATE_API_KEY`). Both apps point at the same indexer.

---

## 4. Parity checklist — what web has that mobile needs

Port each from `apps/web` (the data/onchain bits are already shared):

- [ ] **Design refresh** — "liquid neobrutalism": Sui-blue accent (`#0a84ff`), frosted cards, soft shadows, big radii, lighter type. Tokens in `packages/ui/tokens.ts`; the web theme is `packages/ui/theme.css` (CSS — translate to NativeWind classes / RN styles).
- [ ] **Cast-style compose modal** with **image previews** (up to 2) + a **Tokenize toggle** (web: `components/compose-modal.tsx`, `compose-box.tsx`). Inline = quick post, modal = full.
- [ ] **Likes** — Sui-logo icon, grey→blue, **per-user persisted** via `trpc.likeState` + `addReaction` (sign personal message with the zkLogin keypair). Web: `components/like-button.tsx`.
- [ ] **Toasts** + auto-refresh after posting (post is indexed ~4s later). Web: `components/toaster.tsx`.
- [ ] **DeepBook trade terminal** (`/trade`): pair selector (all testnet pools + SULTAN), live order book (`deepbook.getOrderBook`), price chart. ⚠️ `lightweight-charts` is web-only — use a RN chart lib (e.g. `react-native-wagmi-charts` or `victory-native`).
- [ ] **Predict feed** — real DeepBook Predict BTC oracle markets + livestream "pops". Web: `lib/predict.ts` (port as-is — it's just `fetch`), `components/predict-feed.tsx`.
- [ ] **Wallet binding** (Settings) — link an external Sui wallet (Farcaster-style verified address). Mobile needs an RN wallet-connect path (different from web dapp-kit); `trpc.linkWallet` + signing are shared.
- [ ] **Creator coin on profile** — `trpc.creatorCoins(owner)` card with a Trade button.
- [ ] **Messages** — placeholder only for now (Phase 3, Sui Stack Messaging SDK). Don't build.

---

## 5. Gotchas / notes

- **zkLogin in RN ≠ web.** Web uses dapp-kit's `registerEnokiWallets`. Mobile uses `EnokiFlow` directly (`lib/auth.tsx`): `createAuthorizationURL` → `WebBrowser.openAuthSessionAsync` → `handleAuthCallback` → `getKeypair`. You need a **Google OAuth client of type Android/iOS** (web's "Web application" client won't accept the `umbra://` custom-scheme redirect).
- **Identity vs funds:** the zkLogin account is the social identity; funded actions (DeepBook trades, pool creation, the per-post coin mint) use a **linked/bound wallet** (binding feature). zkLogin accounts have no DEEP.
- **Charts:** DeepBook has no cheap OHLC for pairs (web polls mid-price → area). Predict (BTC) has real candles via GMX, but for now the Predict chart uses the Predict server's price history. Pick a RN charting lib.
- **No `@types/react` mixing:** mobile is React 18.3 (Expo SDK 52), web is React 19. Keep them isolated (don't import web React components into mobile).
- **Testnet only.** Never mainnet. IDs are in `packages/move/deployments/testnet.json` and `apps/web/lib/deepbook.ts` (SULTAN coin + pool).

---

## 6. Suggested build order

1. Design tokens → RN theme (NativeWind), get the feed/profile looking like web.
2. Compose modal + image previews + likes + toasts (the core social loop).
3. Trade terminal (order book first, chart second).
4. Predict feed (it's mostly `fetch` + an animated list — high impact, low risk).
5. Wallet binding, then creator-coin card.
6. Leave Messages as a placeholder.

Questions? The web app is the source of truth for UX + wiring. Read
`apps/web/lib/*` and the matching `apps/web/components/*` before porting.
