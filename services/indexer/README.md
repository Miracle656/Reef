# @umbra/indexer

Reads Sui testnet events for the `umbra` package and materializes them into
**Postgres** (Prisma), exposes a typed **tRPC** API, and hosts the Enoki
**sponsor** + SuiNS **subname** endpoints.

## Pieces

- `src/indexer/` — `poller` polls `queryEvents` per MoveModule with a persisted
  cursor; `handlers` validate `parsedJson` (shared Zod schemas) and upsert.
- `src/trpc/` — `feed`, `profileByHandle`, `post`, `followers`, `following`,
  `addReaction` (signature-verified), `reactionsForPost`.
- `src/reactions.ts` — verifies Sui personal-message signatures, aggregates.
- `src/sponsor.ts` — `POST /sponsor` + `POST /sponsor/execute` (Enoki, key server-side).
- `src/suins.ts` — `POST /suins/mint` leaf-subname minting (D-3).

## Run

```bash
pnpm db:generate          # prisma generate (done once / after schema changes)
pnpm db:push              # create tables (needs DATABASE_URL)
pnpm --filter @umbra/indexer dev   # starts API + poller
```

Requires `DATABASE_URL`, `UMBRA_PACKAGE_ID`, `UMBRA_REGISTRY_ID`; `ENOKI_PRIVATE_API_KEY`
and `SUINS_PARENT_NAME` enable the sponsor and minting endpoints respectively.

## Status

API, poller, sponsor, and reactions are implemented and typechecked against the
2.x SDKs. The SuiNS on-chain mint is stubbed (computes the subname) pending the
testnet parent-name registration — see root `CLAUDE.md` D-3.
