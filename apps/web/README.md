# apps/web — Umbra (Next.js)

Next.js 15 (App Router) + React 19 + Tailwind v4 + `@mysten/dapp-kit` +
`@tanstack/react-query`. Walletless sign-in (Enoki/Google zkLogin), onboarding
(handle + avatar → Walrus + SuiNS subname), home feed, compose (text + image),
profile, follow/unfollow, off-chain likes. **Gasless everywhere** via the
indexer's Enoki sponsor endpoint.

Design: smooth, clean **neobrutalism** from `@umbra/ui` tokens — near-monochrome
paper/ink, 2px ink borders, hard offset shadows, one sparing teal accent.

## Structure

- `app/` — `page` (feed/sign-in/onboard gate), `onboarding`, `u/[handle]` (profile).
- `app/providers.tsx` — QueryClient + SuiClientProvider + Enoki wallet registration + WalletProvider.
- `lib/` — `config` (public env → UmbraConfig), `trpc` (typed client to the indexer),
  `gasless` (build → sponsor → sign → execute), `objects` (owned-object lookups).
- `components/` — neobrutalist `ui` kit + feature components.

## Run

```bash
cp ../../.env.example .env.local   # fill NEXT_PUBLIC_* (package id, Enoki, Google client)
pnpm --filter web dev
```

## Status

Builds clean (`next build`, 4 routes) and typechecks against the 2.x SDKs.
Runtime gasless flow needs real Enoki/Google credentials + a published package id
(placeholders show a "demo not wired" banner). The verification flow goes live
once those env vars are set and the indexer is running.
