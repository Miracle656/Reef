# @umbra/indexer

Reads Sui testnet checkpoints, filters for the `umbra` package events
(`ProfileCreated`, `PostCreated`, `Followed`, …), and materializes them into
**Postgres**. Exposes a typed **tRPC** API (feed, profile, graph) and the
reactions endpoint (verifies off-chain wallet-signed reactions, aggregates
counts — no on-chain write in Phase 1). Also hosts the Enoki **sponsor**
endpoint so the private API key stays server-side.

> Status: package shell only. Implementation begins once the contract + auth
> design is approved. API choice (tRPC vs REST) is decided in root `CLAUDE.md`.
