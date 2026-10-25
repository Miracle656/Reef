# ReeF

**The social layer of Sui.** A decentralized social superapp where identity,
the social graph, content, payments, markets and messaging are native Sui
primitives instead of bolted-together protocols. Mobile-first and
**Lagos-first**, so walletless onboarding and gasless UX are non-negotiable:
users sign in with Google and never see a seed phrase or pay gas.

**Testnet only.** Web: https://reef-web-one.vercel.app

> The codename in code is still **`umbra`**: the `@umbra/*` packages, the Move
> package, env vars like `UMBRA_PACKAGE_ID` and the mobile bundle id. A full
> rename is pending, so the commands below use the `umbra` names.

## What it does

- **Walletless and gasless.** Google sign-in via zkLogin (Enoki) gives each user
  a self-custodial Sui address, and Enoki sponsors the gas for every transaction.
- **Social.** Profiles, posts with images, replies, quotes, mentions, follows,
  For you / Following feeds, notifications, search and 24h stories. Profiles,
  posts and follows are owned Sui objects; likes, reposts and bookmarks are
  signed off-chain messages that the indexer verifies and counts.
- **Trade.** Gasless DeepBook v3 market swaps, plus DeepBook Predict BTC
  prediction markets (up/down and range bets).
- **Messages.** End-to-end encrypted DMs and groups on the Sui Stack Messaging
  SDK (Seal + Walrus + a self-hosted relayer).

## Repo layout

| Path | What it is |
|---|---|
| `packages/move` | Sui Move contracts: `registry`, `profile`, `post`, `follow` (published to testnet) |
| `packages/creator-coin` | Creator-coin template (the demo `$SULTAN` coin) |
| `packages/core` | Shared logic: Sui client, transaction builders, gasless sponsor client, Walrus, DeepBook v3, Zod schemas |
| `packages/ui` | Design tokens and the Tailwind v4 theme |
| `services/indexer` | Hono server: event poller → Postgres (Prisma) → tRPC API, plus the Enoki sponsor endpoint, a dUSDC faucet and image / DeepBook proxies |
| `apps/web` | Next.js 15 web app (deployed on Vercel) |
| `apps/mobile` | Expo SDK 54 app (EAS builds) |

pnpm workspaces + Turborepo, TypeScript strict throughout.

## Status

| Area | State |
|---|---|
| Move contracts | ✅ published to testnet · 16 tests |
| `@umbra/core` | ✅ 12 tests |
| `services/indexer` | ✅ 3 tests |
| `apps/web` | ✅ social, trade, predict, messages, stories |
| `apps/mobile` | ✅ most web features, including messages · 🟡 swaps not wired yet |

Not built yet: per-post coin minting (the composer's Tokenize toggle is UI only),
on-chain SuiNS subname minting, Walrus blob renewal, DeepBook limit orders and
Seal-gated content.

## Quick start

```bash
pnpm install

# contracts (needs the sui CLI)
pnpm move:build
pnpm move:test
pnpm move:publish                       # testnet; needs a funded sui client (see CLAUDE.md)

# tests
pnpm --filter @umbra/core test
pnpm --filter @umbra/indexer test

# indexer database: generate the Prisma client, then apply the schema
pnpm --filter @umbra/indexer db:generate
pnpm --filter @umbra/indexer db:push    # applies to whatever DATABASE_URL points at

# run it
pnpm --filter @umbra/indexer dev        # API + sponsor + event poller on :3001
pnpm --filter web dev                   # web on :3000
pnpm --filter mobile start              # Expo dev server
```

The indexer needs `DATABASE_URL`, `UMBRA_PACKAGE_ID` and `UMBRA_REGISTRY_ID`,
plus `ENOKI_PRIVATE_API_KEY` for gasless transactions. The apps need the public
`NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` values (see `.env.example`).

## Docs

- `CLAUDE.md`: architecture, the owned-vs-shared object model, the Enoki
  sponsored-transaction flow and the decisions log
- `DEPLOY.md`: deploying the web app (Vercel) and the indexer
- `apps/mobile/CONTRIBUTING.md`: guide to working on the mobile app
- `docs/reef-brief.html`: product and design brief

## Security

Testnet only. No secrets in the repo: copy `.env.example` into each app's env
file (`apps/web/.env.local`, `apps/mobile/.env`, `services/indexer/.env`) and
fill it in. The Enoki private key lives only on the indexer (the sponsor
endpoint); the apps get public keys only.
