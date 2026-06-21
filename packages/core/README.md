# @umbra/core

Shared, app-agnostic logic imported by **both** `apps/web` and `apps/mobile`.
No business logic is duplicated across the apps — it lives here.

Planned modules (built after the design review):

- `sui/` — testnet client factory, typed bindings for the `umbra` Move modules.
- `auth/` — Enoki zkLogin (Google first), session handling, and the sponsored-tx
  helper (build tx client-side → ship `transactionKindBytes` to the sponsor → return result).
- `walrus/` — blob upload (via publisher / upload-relay), read, and epoch-renewal helper.
- `schemas/` — Zod schemas + TS types shared with `services/indexer`.

> Status: package shell only. Implementation begins once the contract + auth
> design is approved (see root `CLAUDE.md`).
