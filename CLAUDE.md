# ReeF — CLAUDE.md

> **ReeF** (codename in code: `umbra`). A Sui-native decentralized social superapp.
> Identity, the social graph, content, payments, and messaging are native Sui
> primitives. Target users: mainstream, mobile-first, **Lagos-first** — so
> walletless onboarding and gasless UX are hard product requirements.

**Current phase:** Phase 1 (identity → on-chain graph → storage → indexer → feed).
**Network:** one switch, `NEXT_PUBLIC_SUI_NETWORK`. The social app is testnet
only: never mainnet in Phase 1. Switched to `mainnet`, the app is the wallet
alone, every testnet feature is hidden (D-13), and people sign in with a
passkey instead of Google (D-15).
**Status:** contracts published to testnet; `@umbra/core`, the indexer, the web
app and the mobile app are built. See `README.md` for the current status table.

---

## Capability → Sui primitive

| Capability | Primitive / tool |
|---|---|
| Identity (walletless) | zkLogin via **Enoki** (Google → self-custodial address) on the testnet app; a **passkey** on the mainnet wallet (D-15) |
| Gasless tx | **Enoki sponsored transactions** (backend-signed) |
| Handles | app-level registry now; **SuiNS** link reserved (see decision D-3) |
| Profiles / posts / follows | **Sui Move objects** (owned-first for parallelism) |
| Media storage | **Walrus** blobs (epoch-based; renewal logic required) |
| Gated content | **Seal** (Phase 2) |
| DMs / groups | **Messaging SDK** (Phase 3) |
| Creator coins | per-creator `Coin` + **DeepBook v3** (Phase 2) |
| Tips | native **USDC** + Enoki sponsorship (Phase 2) |
| Wallet / cash-out | **gasless stablecoin transfers** (`0x2::balance::send_funds`); naira offramp via Linq (D-13) |
| Feed / discovery | **off-chain indexer → Postgres → tRPC API** |
| AI agents | **Nautilus** TEE + Messaging (Phase 4) |

Durable/valuable state lives on-chain (profiles, follows, posts). High-frequency
low-value actions (likes/reactions) are **off-chain**, aggregated by the indexer
— this is the deliberate avoidance of the state-bloat wall (D-2).

---

## Monorepo layout

```
reef/
├── apps/web/                Next.js 15 web app (Vercel)
├── apps/mobile/             Expo SDK 54 app
├── packages/move/           Sui Move package + tests (published to testnet)
├── packages/creator-coin/   creator-coin template ($SULTAN)
├── packages/core/           Sui client, tx builders, sponsor client, Walrus, DeepBook, schemas
├── packages/ui/             design tokens + Tailwind v4 theme
└── services/indexer/        event poller + tRPC API + sponsor endpoint + faucet
```

Tooling: pnpm workspaces + Turborepo, TypeScript strict everywhere.

---

## Locked SDK versions (verified against npm registry, 2026-11-13)

| Package | Version | Used in |
|---|---|---|
| `@mysten/sui` | 2.39.1 | core (web + mobile + indexer). Needs Node 22+ |
| `@mysten/dapp-kit` | 1.1.17 | web (deprecated upstream; migration plan in D-12) |
| `@mysten/enoki` | 1.3.4 | auth + sponsor |
| `@mysten/walrus` | 1.2.1 | storage |
| `@mysten/seal` | 1.5.4 | chat encryption (messaging peer) |
| `@mysten/suins` | 1.2.1 | handles link |
| `@mysten/deepbook-v3` | 2.12.0 | trade (spot only; the 2.0 break was margin/Pyth) |
| `@mysten/sui-stack-messaging` | 0.0.2 | chat (P3) |
| `@mysten/sui-groups` | 0.0.1 | chat (P3) |
| `@tanstack/react-query` | ^5.90 | web/mobile data |

Toolchain present: Sui CLI **1.60.0**, Node **24** (22+ required), pnpm **10.20**.

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
- **D-11** (2026-11) Sui shut JSON-RPC off on public endpoints (Mysten Aug 2026, publicnode Oct 2026). `createSuiClient` now returns `SuiGrpcClient` (`@mysten/sui/grpc`, gRPC-web to `fullnode.<net>.sui.io:443`); code uses the core API (`listOwnedObjects`, `getBalance().balance.balance`, `simulateTransaction` instead of devInspect). The indexer ingests events over **GraphQL** (gRPC has no event query); GraphQL cursors are stored tagged `eventSeq="gql"`, and an untagged legacy cursor triggers a safe full replay. Web: dapp-kit 1.x gets the gRPC client via `createClient`; read it with `useChainClient()` (`apps/web/lib/sui-client.ts`). Supersedes the RPC parts of D-8/D-9.
- **D-10** `@umbra/core` split entrypoints: client-safe `@umbra/core` vs server-only `@umbra/core/server` (Enoki private key), so the key can't be bundled into apps.
- **D-12** (2026-11, #18) **`@mysten/dapp-kit` → `@mysten/dapp-kit-react`: migrate, but as its own change.** npm marks dapp-kit 1.x deprecated ("only supports the deprecated Sui JSON-RPC API and will not receive further updates"), so web should move. It is not a hook rename, for three reasons:
  1. `useWallets()` returns `UiWallet` handles (`@wallet-standard/ui`), not raw wallet-standard wallets. `isEnokiWallet()` and Enoki's `getSession(wallet)` take the raw wallet, so they need `getWalletFeature` from `@wallet-standard/ui-features` (add it as a direct dep) or a `features.includes("enoki:getMetadata")` check.
  2. `dAppKit.signTransaction` / `signPersonalMessage` take an optional `account` but sign through the *connected* wallet. ReeF's rule is that the zkLogin wallet signs even while a linked Slush wallet is connected (`lib/gasless.ts`), so keep calling the Enoki wallet's feature directly, via `getWalletFeature(enokiUiWallet, "sui:signTransaction")`.
  3. Enoki 1.3 ships `enokiWalletsInitializer` for `createDAppKit({ walletInitializers })`, but the Google `redirectUrl` uses `window.location.origin`, which doesn't exist when Next renders on the server. Keep registering Enoki wallets in a client-only effect (`registerEnokiWallets({ client: useCurrentClient(), network: useCurrentNetwork() })`), or create the kit lazily on the client.

  Mapping: `useSuiClient` → `useCurrentClient` (this removes the `useChainClient()` cast), `useSuiClientContext` → `useCurrentClient` + `useCurrentNetwork`, `useConnectWallet`/`useDisconnectWallet`/`useSignPersonalMessage` → `useDAppKit().connectWallet/disconnectWallet/signPersonalMessage` (wrap in `useMutation` where `isPending` is shown), `useCurrentWallet().currentWallet` → `useCurrentWallet()`. Add the `Register` module augmentation for typed hooks. Touches 11 files in `apps/web`. **Gate:** test Google sign-in, onboarding, likes, and link/unlink of a Slush wallet on the production URL before merging, since none of that can be tested on preview or localhost.
- **D-13** (2026-11) **On mainnet the app is the wallet alone, and stablecoin sends are gasless.** The owner wants production on mainnet showing only the wallet (with cash-out), and everything else kept testnet-only and hidden until it is ready. `NEXT_PUBLIC_SUI_NETWORK` is the one switch: `testnet` is the full app on test money; `mainnet` is the wallet only (`WALLET_ONLY` in `apps/web/lib/config.ts`). In that mode `apps/web/middleware.ts` sends every page that isn't on its short allowlist to `/wallet`, the nav is Wallet + Settings, the home page is a wallet landing, and nothing calls the (testnet) indexer. A zkLogin or passkey address is the same on both networks, so it is the same account. On testnet the wallet is opt-in (`NEXT_PUBLIC_WALLET_NETWORK=testnet`). Never show a mainnet wallet next to testnet features: real money and test money must not share a screen.
  - `@umbra/core`'s `wallet` namespace holds the coin list (mainnet USDC + USDSUI + SUI; testnet Circle test USDC + SUI), exact bigint amount math and `buildSendTx`.
  - USDC and USDSUI are sent with `0x2::balance::send_funds` alone. Sui runs that shape with gas price 0 ("gasless stablecoin transfers": mainnet since May 2026, also on testnet), so users need no SUI and there is no sponsor. The SDK detects it when the tx is built with a gRPC client. Minimum 0.01; the recipient is credited in its **address balance**, not a new `Coin` object. SUI is sent the ordinary way and pays its own gas.
  - The wallet always runs on the app's own network, so there is one account and one sign-in: a passkey on the wallet-only app (D-15), Google on the full testnet app.
  - The send flow builds and dry-runs first, shows that result for review, then signs exactly those bytes.
  - Live check, read-only: `pnpm --filter @umbra/indexer wallet:probe <mainnet|testnet> <address>`.
- **D-14** (2026-11) **Naira cash-out runs in the web app, through Linq, without custody.** Linq's B2B offramp API takes USDC/USDSUI on Sui and pays a Nigerian bank account. It is mainnet only and has no sandbox.
  - **Where it runs:** Next route handlers in `apps/web` (`/api/cashout`, `/api/webhooks/linq`), not the indexer, so cash-out doesn't depend on the indexer host. They are thin: the rules are `createCashoutService` in `@umbra/core/server` (`packages/core/src/cashout`), with Linq, the store and signature verification injected, so the whole flow is unit-tested.
  - **No custody.** The server asks Linq for an order; the wallet then sends the dollars (a gasless transfer, D-13) straight to that order's one-time deposit address. `manualDeposit: true` is hard-coded in the Linq client: users hold their own keys, so the payout must follow what really arrived.
  - **Auth without a login:** the wallet proves who it is by signing a personal message, verified on the wallet's network. Either each request carries its own signature (`cashout.canonicalCashoutBytes`), or the wallet signs once to open a 30-minute **session** (`cashout.canonicalCashoutSessionBytes`) and sends that with every request. The web app uses a session, because a passkey shows a prompt for every signature: one cash-out is then two prompts (the session, and the transfer) instead of five or more. A session only opens this API for its own wallet; money moves by a transaction signed separately. Every request must still be fresh within 5 minutes, and an order can be read or changed only by the address that made it. **The one request that needs no proof is the bank-account lookup**: the name on an account says nothing about a wallet, and a passkey prompt just to check an account number was friction with nothing behind it (the owner's first complaint on trying it). It is throttled instead: 10 a minute per wallet named, 20 per caller address, 60 for everyone, counted in the instance's memory, with found names kept for 10 minutes so checking and then ordering asks Linq once.
  - **Linq's answers are checked** before the app is told where to send: chain, coin type, a real Sui address that isn't the user's own, an amount within the limit, numbers that add up. The account name comes from our own bank lookup, never from the client. Linq sends the bank's name EMPTY for some banks (OPay, 2026-11-20), so that field is optional and filled from our own bank list. A Linq answer that can't be read is reported as "couldn't check right now" and logged, never as "account not found": only Linq's own 4xx means that.
  - **Order ids are chosen by the client** and double as Linq's idempotency key, so a retry can't create a second order. 3 orders per 10 minutes and 20 a day per wallet; $1 to $500 per order by default.
  - **Status** comes from polling Linq when the app asks; Linq's webhook (HMAC-verified on the raw body) only speeds it up, since Linq sends each event once. A status only moves forward and `paid` is final.
  - **Storage:** one Postgres table, `CashoutOrder`, plain SQL over Neon's HTTP driver; the full account number is never stored. The table is also in the Prisma schema so `db push` keeps it, and the SQL is tested against a real in-process Postgres (PGlite).
  - **Rehearsal mode** (`CASHOUT_MODE=mock`) replaces Linq with a stand-in so the flow can be run with test USDC. `pnpm --filter @umbra/indexer cashout:smoke <url> [webhook secret]` drives a rehearsal deployment end to end. On mainnet a rehearsal moves real dollars to the rehearsal address, so it runs only for the wallets named in `CASHOUT_MOCK_ALLOWED_OWNERS`.
- **D-15** (2026-11) **On the mainnet wallet the account is a passkey.** Enoki's mainnet access is a paid plan, so the wallet-only app has no Google sign-in and no Enoki at all (owner's decision, 2026-11-20). The passkey's secp256r1 public key gives the Sui address and the passkey signs every transaction (SIP-9; `passkey_auth` is on for mainnet). There is no server account, and what the browser remembers (public key + credential id) is not secret. The rules are `passkey` in `@umbra/core` (unit-tested with a software authenticator); the WebAuthn calls are `apps/web/lib/passkey.ts`.
  - **Making a wallet is two taps.** The first creates the passkey. The second signs a fixed check message, and the app asks a Sui node (`SignatureVerificationService.VerifySignature`) whether that signature belongs to the new address. Only then is the wallet remembered and its address shown. A browser or password manager that hands back a key it can't sign with is caught before any money is sent there.
  - **Opening a wallet again is two taps too**, with nothing stored anywhere. A passkey never gives its public key out again, so it is worked back from signatures: one signature fits two possible keys, a second from the same passkey leaves one. The second prompt is held to the passkey picked in the first. Signing out only makes the browser forget the wallet.
  - **Every signature is a prompt, and a prompt must follow a tap** (Safari enforces it). So each prompt has its own button, nothing signs from an effect or a timer, and cash-out signs once per session (D-14).
  - **A passkey is tied to its web address for good** (the WebAuthn RP ID). On mainnet `NEXT_PUBLIC_PASSKEY_RP_ID` must be set on purpose or no wallet can be made, so a wallet is never bound to a preview URL. Moving to another domain later means either keeping the old address alive or serving `/.well-known/webauthn` from it (Related Origin Requests), so choose the address before real users arrive (#9).
  - **No recovery yet.** If the passkey is deleted the money can't be reached; a synced passkey (Google Password Manager, iCloud Keychain) survives a lost phone. A second passkey through `address_alias` (as #10 does for Google accounts) is the planned backup.
  - `NEXT_PUBLIC_WALLET_ONLY=1` shows the wallet-only app on testnet, to try all of this with test money.
  - To walk through the passkey screens without a device prompt (or from a script), paste `apps/web/dev/soft-passkey.js` into the console on a local dev page: a software passkey answers `navigator.credentials`, and everything else is the app's real code.
  - Live check, read-only: `pnpm --filter @umbra/indexer passkey:probe <mainnet|testnet>` (a node accepts the app's passkey signatures and refuses wrong ones). A passkey-signed transaction really executing is covered on testnet by `sponsor:smoke`.
- **D-16** (2026-11) **The wallet swaps SUI for USDC on DeepBook, and counts SUI in its total.** People get paid in SUI, but the wallet is about dollars and cash-out only takes dollars.
  - The swap trades straight against DeepBook v3's public SUI/USDC pool: no ReeF fee and no account with anyone. Mainnet only (the testnet DeepBook trades its own test dollar, not the wallet's test USDC). The rules are `swap` in `@umbra/core` (`packages/core/src/wallet/swap.ts`).
  - Measured on mainnet 2026-11-20: the pool sells SUI in steps of 0.1 with a 1 SUI minimum, and takes a 0.025% fee out of the SUI going in, so no DEEP is needed. The wallet therefore hands over the typed quantity plus that fee (`offerFor`), and keeps 0.05 SUI back as the gas budget (`SWAP_FEE_RESERVE`; the SDK's own default budget of 0.25 SUI is more than a small wallet holds).
  - Same flow as sending: quote, build, dry-run, show that result, sign exactly those bytes. The least the swap may pay out (the quote less 1%) is inside the signed transaction.
  - **A swap under the pool's minimum "succeeds" and does nothing, and the pool skips its own minimum-out check when that happens.** So `buildSwapTx` enforces the minimum itself: it takes `minOut` out of the bought coin and puts it back, which aborts if the coin holds less. It also merges unsold SUI back into the gas coin and destroys the empty DEEP coin, so a swap leaves one new object, the USDC.
  - The total adds SUI at its market price (`wallet.walletValue`). The price is the mid of the same order book, read by `/api/prices` on the server (CDN-cached for 30 seconds), so a phone doesn't download the DeepBook SDK to see a balance; the swap screen is loaded on demand for the same reason. A book whose two sides are more than 2% apart gives no price, and the page then says SUI isn't counted. The price is for display only: no amount that moves money is worked out from it. (Pyth's public Hermes API has needed a key since 2026, which is why it isn't the source.)
  - Live check, read-only: `pnpm --filter @umbra/indexer swap:probe [address] [amount]` simulates the app's exact swap on mainnet.

## TODO

- [x] Verify SDK versions.
- [x] Scaffold monorepo (pnpm + Turbo) + `.env.example`.
- [x] `profile` / `post` / `follow` / `registry` Move modules + 16 tests + publish script.
- [x] **Review checkpoint** — object model, interfaces, Enoki flow reviewed; D-3 (SuiNS subname) + D-7 (editable posts) decided.
- [x] Publish package to testnet (via WSL sui 1.72, owner `0x669f…ec58`). Package `0x2e066a2176aaaf4e61064b74d3b4d9ea80d10ceca1372a9cd4bda36412ff761f`, Registry `0x1abe492364bcaff32648a432ca5ca4cf91d9fa0307b4f389ecf1a9c36daad933` (see `packages/move/deployments/testnet.json`).
- [x] `@umbra/core`: client factory, bindings, Enoki sponsor helper, Walrus module, Zod schemas (12 tests).
- [x] `services/indexer`: event poller → Postgres (Prisma) → tRPC feed API + sponsor endpoint + reactions + SuiNS mint stub (typechecked, 3 tests).
- [x] `packages/ui`: smooth-neobrutalist design tokens + Tailwind v4 theme.
- [x] `apps/web`: Next 15 App Router — sign-in, onboarding, feed, compose, profile, follow, likes, trade, predict, messages, stories; gasless via core.
- [x] `apps/mobile` (Expo) — most web features incl. messages, shares `@umbra/core` (swaps not wired yet; see #1).
- [ ] Finish the `umbra` → ReeF code rename (`@umbra/*`, `UMBRA_*`, bundle id, Expo scheme/slug).
- [ ] Wire on-chain SuiNS leaf-subname mint (needs testnet parent name).
- [x] Web wallet at `/wallet` (D-13): balances, receive (address + QR), gasless USDC/USDSUI send. Off until `NEXT_PUBLIC_WALLET_NETWORK` is set.
- [x] Passkey sign-in for the wallet-only app (D-15), and cash-out on one confirmation per session (D-14).
- [ ] Go live on mainnet: choose the wallet's web address first (a custom domain if there will ever be one, #9), then set `NEXT_PUBLIC_PASSKEY_RP_ID` to it and `NEXT_PUBLIC_SUI_NETWORK=mainnet` on Vercel. Then create a wallet and send a small amount: the first real transfer signed by a passkey from the app.
- [x] Swap SUI to USDC in the wallet, and SUI counted in the total (D-16). The other direction (USDC to SUI) and USDSUI aren't built.
- [ ] A backup passkey for the mainnet wallet (`address_alias`), so a lost passkey isn't lost money.
- [x] Naira cash-out (D-14): Linq client, rules, order table, API routes and the Cash out screen in `/wallet`, with a rehearsal mode. Off until `LINQ_API_KEY` or `CASHOUT_MODE=mock` is set.
- [ ] Cash-out go-live: rehearse on production with your own wallet (`CASHOUT_MODE=mock` + `CASHOUT_MOCK_ALLOWED_OWNERS`), get the Linq key (register the webhook URL at signup), confirm Linq detects address-balance (gasless) deposits, get the full bank list (`nigerian-banks.json`; only the 15 banks in Linq's guide are listed), then one small real cash-out.
- [ ] Wallet on mobile (passkeys there need the app's own domain association, #9).
- [x] Walrus blob ownership + renewal job (`services/indexer/src/walrus-renew.ts`; uploads `send_object_to` the blob owner, job calls `system::extend_blob`). Needs `WALRUS_RENEWER_SECRET_KEY` + `*_WALRUS_BLOB_OWNER` set in prod.

---

## Review checkpoint — DONE

Object model (D-1/D-2), module interfaces, and the Enoki flow were reviewed.
Decisions locked: **D-3** free SuiNS leaf-subname `<handle>.umbra.sui`; **D-7**
editable/deletable posts. Contract layer updated + re-tested (16/16).

Everything in the original "next slice" (testnet publish → core → indexer → ui →
web → mobile) has shipped. Open work is tracked in GitHub issues.
