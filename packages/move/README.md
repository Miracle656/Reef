# @umbra/move — Sui Move contracts

Phase 1 on-chain object model: **profiles, posts, and the follow graph**.

## Modules

| Module | Object(s) | Ownership | Events |
|---|---|---|---|
| `registry` | `Registry` | **shared** | — |
| `profile`  | `Profile`  | **owned** (by user) | `ProfileCreated`, `ProfileUpdated` |
| `post`     | `Post`     | **owned** (by author) | `PostCreated`, `PostDeleted` |
| `follow`   | `FollowSet` (+ dynamic-field edges) | **owned** (by follower) | `Followed`, `Unfollowed` |

See root `CLAUDE.md` for the full owned-vs-shared rationale.

## Build / test

```bash
sui move build      # from this dir, or `pnpm move:build` from repo root
sui move test       # 15 unit tests, or `pnpm move:test`
```

## Publish (testnet)

Prereqs: a working `sui client` on testnet with a funded address.

```bash
node scripts/publish.mjs    # or `pnpm move:publish` from repo root
```

Writes `deployments/testnet.json` and prints the IDs to copy into root `.env`.
