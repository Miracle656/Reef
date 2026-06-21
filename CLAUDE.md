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
| `Post` | owned by author | Posting touches no shared state → fully parallel. **Owned + editable/deletable** (D-7): `edit_post`/`delete_post`, author-gated, emit `PostEdited`/`PostDeleted`. |
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

### D-3 — Handles: free auto-minted SuiNS leaf-subname under an app parent *(decided)*

Every user gets a real SuiNS name from day one **for free**: an app-owned parent
name `umbra.sui` mints each user a **leaf subname** `<handle>.umbra.sui` pointing
at their zkLogin address. Leaf subnames are the right tool — the parent owner
creates/controls them, the user owns nothing and pays nothing, and the backend
(holder of the parent name) sponsors creation.

Our shared `Registry` still owns the fast invariants (one profile/address; label
uniqueness + quick reverse lookup); SuiNS enforces global subname uniqueness
on-chain as a backstop. `Profile.handle` = the label (`alice`);
`Profile.suins_name` = the full subname (`alice.umbra.sui`), recorded at creation.

**Onboarding is two transactions** (both gasless to the user):
1. **Backend-signed tx** — backend owns the `umbra.sui` parent `SuinsRegistration`
   and creates the leaf subname `<handle>.umbra.sui` → user address. (Must be a
   separate tx: the parent NFT is owned by the backend, so it can't be referenced
   inside a user-signed PTB.)
2. **User sponsored PTB** — `create_profile(... suins_name: "alice.umbra.sui")` +
   `create_follow_set()`.

> TODO before wiring `@umbra/core`: verify the `@mysten/suins` 1.2.1 leaf-subname
> creation API and the testnet parent-name registration flow, and register/fund
> the `umbra.sui` (or chosen) parent name on testnet. Fallback if leaf subnames
> are impractical on testnet: app-registry handle only, link SuiNS later via
> `set_suins_name`.

### Move module interfaces (Phase 1)

`registry` (shared `Registry`):
- `register(reg, handle, owner, profile_id)` — `public(package)`; aborts on dup handle/profile.
- `change_handle(reg, old, new, owner)` — `public(package)`.
- views: `has_profile`, `handle_taken`, `profile_of`.

`profile` (owned `Profile { owner, handle, display_name, bio, avatar_blob_id, suins_name, created_at_ms, updated_at_ms }`):
- `create_profile(reg, handle, display_name, bio, avatar_blob_id: Option, suins_name: Option, clock, ctx)`
- `update_profile(profile, display_name, bio, avatar_blob_id, clock, ctx)`
- `change_handle(reg, profile, new_handle, clock, ctx)`
- `set_suins_name(profile, suins_name, clock, ctx)`
- Events: `ProfileCreated` (incl. `suins_name`), `ProfileUpdated`. Handles normalized to `[a-z0-9_]`, 3–20 chars.

`post` (owned `Post { author, text, media: vector<String>, reply_to: Option<ID>, created_at_ms, updated_at_ms }`):
- `create_post(text, media: vector<vector<u8>>, reply_to: Option<ID>, clock, ctx)` — text ≤560, media ≤4, non-empty.
- `edit_post(post, text, media, clock, ctx)` — author-gated; preserves `created_at_ms` + reply linkage.
- `delete_post(post, ctx)`
- Events: `PostCreated`, `PostEdited`, `PostDeleted`.

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
pnpm move:test          # 16 tests, all passing
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
- **D-3** Handles = free auto-minted SuiNS **leaf-subname** `<handle>.umbra.sui` under an app-owned parent, recorded on `Profile.suins_name`. Onboarding is 2 gasless txs (backend mints subname; user PTB creates profile+follow set). *Decided.*
- **D-4** Indexer API = tRPC + Prisma + Postgres.
- **D-5** Framework dep: no pinned git `framework/testnet` rev (it outran CLI 1.60 and broke the build); rely on the CLI's bundled system packages.
- **D-6** Sponsor endpoint co-located in `services/indexer` for Phase 1.
- **D-7** Posts are owned + **editable/deletable** (`edit_post`/`delete_post`), not frozen. *Decided.*
- **D-8** `@mysten/sui` v2 API notes (verified): RPC client is `SuiJsonRpcClient` from `@mysten/sui/jsonRpc` (`new SuiJsonRpcClient({ url, network })`); `@mysten/sui/client` exports the `ClientWithCoreApi` interface; sig verify via `@mysten/sui/verify`. Core uses extensionless imports (moduleResolution: Bundler).
- **D-9** Indexer ingests via `queryEvents` polling per MoveModule with a persisted cursor (not raw checkpoint streaming) — simpler + resumable for Phase 1; swappable later.
- **D-10** `@umbra/core` split entrypoints: client-safe `@umbra/core` vs server-only `@umbra/core/server` (Enoki private key), so the key can't be bundled into apps.

## TODO

- [x] Verify SDK versions.
- [x] Scaffold monorepo (pnpm + Turbo) + `.env.example`.
- [x] `profile` / `post` / `follow` / `registry` Move modules + 16 tests + publish script.
- [x] **Review checkpoint** — object model, interfaces, Enoki flow reviewed; D-3 (SuiNS subname) + D-7 (editable posts) decided.
- [ ] Publish package to testnet, record IDs.
- [x] `@umbra/core`: client factory, bindings, Enoki sponsor helper, Walrus module, Zod schemas (12 tests).
- [x] `services/indexer`: event poller → Postgres (Prisma) → tRPC feed API + sponsor endpoint + reactions + SuiNS mint stub (typechecked, 3 tests).
- [ ] `packages/ui`: neobrutalist tokens.
- [ ] `apps/web` then `apps/mobile`.
- [ ] Wire on-chain SuiNS leaf-subname mint (needs testnet parent name).
- [ ] Walrus epoch renewal job (server-side, `@mysten/walrus`).

---

## Review checkpoint — DONE

Object model (D-1/D-2), module interfaces, and the Enoki flow were reviewed.
Decisions locked: **D-3** free SuiNS leaf-subname `<handle>.umbra.sui`; **D-7**
editable/deletable posts. Contract layer updated + re-tested (16/16).

**Next slice (not yet started):** publish to testnet → `@umbra/core` (client,
bindings, Enoki auth + sponsor helper, Walrus, Zod schemas) → `services/indexer`
(checkpoint ingest → Postgres → tRPC + sponsor endpoint + SuiNS subname minting)
→ `packages/ui` tokens → `apps/web` → `apps/mobile`.
