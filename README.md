# Umbra

A **Sui-native decentralized social superapp** — identity, social graph,
content, payments, and messaging built on native Sui primitives instead of
bolted-together protocols. Mobile-first, **Lagos-first**: walletless onboarding
and gasless UX are non-negotiable.

> Phase 1 (this repo): sign up walletless → profile → post text + images →
> follow → see a feed, on both web and mobile, without ever paying gas or seeing
> a wallet prompt. **Testnet only.**

## Stack

- **Contracts:** Sui Move 2024 (`packages/move`)
- **Shared core:** Sui client, contract bindings, Enoki/Walrus/Seal wrappers, Zod schemas (`packages/core`)
- **Web:** Next.js + Tailwind + dapp-kit + React Query + GSAP (`apps/web`)
- **Mobile:** Expo + Expo Router + NativeWind (`apps/mobile`)
- **Indexer + feed API:** Node + tRPC + Prisma + Postgres, plus the Enoki sponsor endpoint (`services/indexer`)
- **Design tokens:** neobrutalist (`packages/ui`)
- Monorepo: pnpm workspaces + Turborepo.

## Status

| Area | State |
|---|---|
| Move contracts (`profile`/`post`/`follow`/`registry`) | ✅ complete, 16 tests passing |
| Monorepo scaffold + `.env.example` | ✅ |
| `@umbra/core`, indexer, UI apps | ⏳ deferred until design review (see `CLAUDE.md`) |

## Quick start

```bash
# Contracts (works today — no network needed for build/test)
pnpm move:build
pnpm move:test

# Publish to testnet (needs a funded sui client; see CLAUDE.md)
pnpm move:publish

# Install workspace deps
pnpm install
```

See **`CLAUDE.md`** for architecture, the owned-vs-shared object decisions, the
Enoki sponsored-transaction flow, and the running TODO.

## Security

Testnet only. No secrets in the repo — copy `.env.example` → `.env` and fill in.
The Enoki private key is server-side only (sponsor endpoint).
