# @umbra/move — Sui Move contracts

Phase 1 on-chain object model: **profiles, posts, and the follow graph**.
`policy/` is a separate package that timelocks the `UpgradeCap`.

## Modules

| Module | Object(s) | Ownership | Events |
|---|---|---|---|
| `registry` | `Registry` (+ `ConfigKey`/`AdminKey` dynamic fields) | **shared** | `RegistryMigrated` |
| `profile`  | `Profile`  | **owned** (by user) | `ProfileCreated`, `ProfileUpdated` |
| `post`     | `Post`     | **owned** (by author) | `PostCreated`, `PostEdited`, `PostDeleted` |
| `follow`   | `FollowSet` (+ dynamic-field edges) | **owned** (by follower) | `Followed`, `Unfollowed` |

`Registry` is versioned for live upgrades: the schema version lives in a
`ConfigKey` dynamic field, `register`/`change_handle` call `assert_version`,
and an admin-gated `migrate` performs the cutover. See root `DEPLOY.md` §3 for
the runbook and `CLAUDE.md` for the owned-vs-shared rationale.

## Build / test

```bash
sui move build      # from this dir, or `pnpm move:build` from repo root
sui move test       # or `pnpm move:test`

sui move test --path policy   # timelock policy package (or `pnpm move:policy:test`)
```

## Publish (testnet)

Prereqs: a working `sui client` on testnet with a funded address.

```bash
node scripts/publish.mjs    # or `pnpm move:publish` from repo root
```

Writes `deployments/testnet.json` and prints the IDs to copy into root `.env`.
