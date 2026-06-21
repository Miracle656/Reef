# Umbra — CLAUDE.md

> Working codename: **Umbra**. A Sui-native decentralized social superapp.
> Identity, the social graph, content, payments, and messaging are native Sui
> primitives. Target users: mainstream, mobile-first, **Lagos-first** — so
> walletless onboarding and gasless UX are hard product requirements.

**Current phase:** Phase 1 (identity → on-chain graph → storage → indexer → feed).
**Network:** testnet only. Never mainnet in Phase 1.
**Status:** contract layer complete + tested. Apps intentionally not scaffolded
yet — awaiting design review (see "Review checkpoint" at the bottom).

---

## Capability → Sui primitive

| Capability | Primitive / tool |
|---|---|
| Identity (walletless) | zkLogin via **Enoki** (Google → self-custodial address) |
| Gasless tx | **Enoki sponsored transactions** (backend-signed) |
| Handles | app-level registry now; **SuiNS** link reserved (see decision D-3) |
| Profiles / posts / follows | **Sui Move objects** (owned-first for parallelism) |
| Media storage | **Walrus** blobs (epoch-based; renewal logic required) |
| Gated content | **Seal** (Phase 2) |
| DMs / groups | **Messaging SDK** (Phase 3) |
| Creator coins | per-creator `Coin` + **DeepBook v3** (Phase 2) |
| Tips | native **USDC** + Enoki sponsorship (Phase 2) |
| Feed / discovery | **off-chain indexer → Postgres → tRPC API** |
| AI agents | **Nautilus** TEE + Messaging (Phase 4) |

Durable/valuable state lives on-chain (profiles, follows, posts). High-frequency
low-value actions (likes/reactions) are **off-chain**, aggregated by the indexer
— this is the deliberate avoidance of the state-bloat wall (D-2).

---

## Monorepo layout

```
umbra/
├── apps/web/            Next.js (deferred)
├── apps/mobile/         Expo (deferred)
├── packages/move/       Sui Move package + tests   ✅ DONE
├── packages/core/       Sui client, bindings, Walrus/Seal/Enoki wrappers, schemas (shell)
├── packages/ui/         design tokens + headless components (shell)
└── services/indexer/    checkpoint indexer + feed API + sponsor endpoint (shell)
```

Tooling: pnpm workspaces + Turborepo, TypeScript strict everywhere.

---

## Locked SDK versions (verified against npm registry, 2026-06-21)

| Package | Version | Used in |
|---|---|---|
| `@mysten/sui` | 2.19.0 | core (web + mobile) |
| `@mysten/dapp-kit` | 1.1.1 | web |
| `@mysten/enoki` | 1.1.1 | auth + sponsor |
| `@mysten/walrus` | 1.2.1 | storage |
| `@mysten/seal` | 1.2.1 | gated content (P2) |
| `@mysten/suins` | 1.2.1 | handles link |
| `@mysten/sui-stack-messaging` | 0.0.2 | chat (P3) |
| `@mysten/sui-groups` | 0.0.1 | chat (P3) |
| `@tanstack/react-query` | ^5.90 | web/mobile data |

Toolchain present: Sui CLI **1.60.0**, Node **24**, pnpm **10.20**.

> Note: `@mysten/sui` is on the **2.x** line and `@mysten/dapp-kit` on **1.x** —
> several older reference apps in `C:\Users\HP\Documents\sui\*` pin 1.x/0.x. We
> target the current majors. Verify APIs against the 2.x docs before importing.

---

## On-chain object model & decisions

### D-1 — Owned-object-first

`Profile`, `Post`, and `FollowSet` are **owned objects** held by the acting user.
Owned-object transactions skip consensus and execute in parallel, so two users
posting (or following) never contend. The only **shared** object is `Registry`,
and it is touched on just two cold paths: profile creation and handle change.

| Object | Ownership | Why |
|---|---|---|
| `Registry` | shared | Global invariants need a single point of truth: one profile/address, unique handles. Low write frequency, so serialization is cheap. |
| `Profile` | owned by user | Only the user edits their profile → parallel. |
| `Post` | owned by author | Posting touches no shared state → fully parallel. Edit/delete by author is a feature. |
| `FollowSet` | owned by follower | Each user mutates only their own follow set → parallel. Edges are dynamic fields keyed by followee for O(1) dup-detection. |

The hot paths (`create_post`, `follow`, `unfollow`) **never read or write a
shared object** (not even `Registry` or the followee's profile) — that is what
keeps them parallel. Validation that a followee exists is left to the indexer.

### D-2 — Reactions are off-chain

Likes/reposts are **not** modeled on-chain. One object per reaction is the exact
state-bloat that forces app-chains. Instead: clients sign reaction messages
off-chain, the indexer verifies the signature and aggregates counts. The Post
`post_id` is stable, so reactions **could** be settled on-chain later without
migrating posts.

### D-3 — Handles: app-registry now, SuiNS link reserved **(needs your call)**

The locked architecture maps handles → SuiNS. But registering a real SuiNS name
on testnet costs gas and a purchase flow, which conflicts with *instant, free*
onboarding for Lagos-first users. **Decision taken:** Phase 1 uses an app-level
handle claimed in our `Registry` (instant, gasless, unique), and `Profile` keeps
a reserved `suins_name: Option<String>` + `set_suins_name` entry to link a real
SuiNS name later (Phase 1.5/2). This is a deliberate deviation from "handles =
SuiNS" — flagging it for your approval. Alternative: require SuiNS at signup
(adds cost/friction). I recommend the app-registry approach.

### Move module interfaces (Phase 1)

`registry` (shared `Registry`):
- `register(reg, handle, owner, profile_id)` — `public(package)`; aborts on dup handle/profile.
- `change_handle(reg, old, new, owner)` — `public(package)`.
- views: `has_profile`, `handle_taken`, `profile_of`.

`profile` (owned `Profile { owner, handle, display_name, bio, avatar_blob_id, suins_name, created_at_ms, updated_at_ms }`):
- `create_profile(reg, handle, display_name, bio, avatar_blob_id: Option, clock, ctx)`
- `update_profile(profile, display_name, bio, avatar_blob_id, clock, ctx)`
- `change_handle(reg, profile, new_handle, clock, ctx)`
- `set_suins_name(profile, suins_name, clock, ctx)`
- Events: `ProfileCreated`, `ProfileUpdated`. Handles normalized to `[a-z0-9_]`, 3–20 chars.

`post` (owned `Post { author, text, media: vector<String>, reply_to: Option<ID>, created_at_ms }`):
- `create_post(text, media: vector<vector<u8>>, reply_to: Option<ID>, clock, ctx)` — text ≤560, media ≤4, non-empty.
- `delete_post(post, ctx)`
- Events: `PostCreated`, `PostDeleted`.

`follow` (owned `FollowSet { owner, following_count }` + dynamic-field edges):
- `create_follow_set(ctx)` — once at onboarding (same PTB as `create_profile`).
- `follow(set, followee, clock, ctx)` / `unfollow(set, followee, ctx)` — dup/self-follow guarded.
- Events: `Followed`, `Unfollowed`.

All entry points are `public fun` (not `entry`) so they compose freely inside
PTBs — required for batching onboarding and for Enoki sponsorship.

---

## Enoki sponsored-transaction flow (plan — for review)

Goal: user signs in with Google, never sees a wallet prompt, never pays gas.

```
┌── client (web dapp-kit / mobile @mysten/sui) ───────────────┐
│ 1. zkLogin via Enoki (Google OAuth) → user's Sui address    │
│ 2. build PTB (e.g. create_profile + create_follow_set)      │
│ 3. tx.build({ onlyTransactionKind: true }) → kindBytes      │
└───────────────┬─────────────────────────────────────────────┘
                │ POST { transactionKindBytes, sender } 
                ▼
┌── sponsor endpoint (services/indexer, server-only key) ─────┐
│ 4. Enoki createSponsoredTransaction(kindBytes, sender,      │
│    network) → { bytes, digest } (Enoki funds + signs gas)   │
└───────────────┬─────────────────────────────────────────────┘
                │ { bytes, digest }
                ▼
┌── client ──────────────────────────────────────────────────┐
│ 5. user signs `bytes` with zkLogin (their key, gasless)     │
└───────────────┬─────────────────────────────────────────────┘
                │ POST { digest, signature }
                ▼
┌── sponsor endpoint ────────────────────────────────────────┐
│ 6. Enoki executeSponsoredTransaction(digest, signature)     │
│    → executed on-chain; return effects                      │
└─────────────────────────────────────────────────────────────┘
```

- `ENOKI_PRIVATE_API_KEY` lives **only** on the server (sponsor endpoint). The
  client uses the public key for zkLogin.
- The sponsor endpoint co-locates in `services/indexer` for Phase 1 (one service
  to run); it can be split into its own route/service later with no client change.
- Exact API surface (`@mysten/enoki` 1.1.1: `EnokiClient`, `createSponsoredTransaction`,
  etc.) to be confirmed against docs.enoki.mystenlabs.com before wiring `@umbra/core/auth`.

---

## Indexer API choice — **tRPC** (decided)

tRPC over REST: end-to-end TypeScript types across the monorepo (the indexer and
both apps share `@umbra/core` Zod schemas), zero codegen, and the feed/profile/
graph procedures stay type-safe into the React Query layer we already use. REST
would need a separate schema/codegen step for the same safety. ORM: **Prisma**
(mature migrations + Postgres). Endpoints: `feed`, `profile(handle)`, `post(id)`,
`followers/following`, `reactions` (verify + aggregate signed messages).

---

## How to run / verify

```bash
# Move contracts (works today)
pnpm move:build
pnpm move:test          # 15 tests, all passing
pnpm move:publish       # testnet; needs a funded sui client (see below)

# Monorepo (shells only until apps are built)
pnpm install
```

Publish prereqs (the local `~/.sui/sui_config/client.yaml` is currently empty/
corrupt — recreate it):
```bash
sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443
sui client switch --env testnet
sui client new-address ed25519        # then fund at https://faucet.sui.io
```

---

## Decisions log

- **D-1** Owned-object-first; `Registry` the only shared object. Hot paths touch no shared state.
- **D-2** Reactions off-chain, indexer-aggregated; stable `post_id` keeps on-chain settlement open.
- **D-3** Handles via app-registry now, SuiNS link reserved. **Pending your approval.**
- **D-4** Indexer API = tRPC + Prisma + Postgres.
- **D-5** Framework dep: no pinned git `framework/testnet` rev (it outran CLI 1.60 and broke the build); rely on the CLI's bundled system packages.
- **D-6** Sponsor endpoint co-located in `services/indexer` for Phase 1.

## TODO

- [x] Verify SDK versions.
- [x] Scaffold monorepo (pnpm + Turbo) + `.env.example`.
- [x] `profile` / `post` / `follow` / `registry` Move modules + 15 tests + publish script.
- [ ] **Review checkpoint** — get sign-off on object model, module interfaces, Enoki flow, D-3.
- [ ] Publish package to testnet, record IDs.
- [ ] `@umbra/core`: client factory, bindings, Enoki auth + sponsor helper, Walrus module, Zod schemas.
- [ ] `services/indexer`: checkpoint ingest → Postgres → tRPC feed API + sponsor endpoint + reactions.
- [ ] `packages/ui`: neobrutalist tokens.
- [ ] `apps/web` then `apps/mobile`.

---

## Review checkpoint (STOP — awaiting your sign-off)

Per the kickoff, UI is not scaffolded until you review: (1) the object-model
decisions (D-1, D-2), (2) the Move module interfaces above, (3) the Enoki
sponsored-tx flow, and (4) the SuiNS deviation (D-3). Once approved, next slice
is `@umbra/core` + the indexer/sponsor endpoint, then the apps.
