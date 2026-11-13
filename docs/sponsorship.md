# Gas sponsorship: Enoki vs the self-run sponsor

ReeF users never hold SUI, so every on-chain action is sponsored. Since #11 the
indexer can sponsor two ways, and the apps choose with one env var:

| | Enoki (default) | Self-run sponsor |
|---|---|---|
| Switch | `NEXT_PUBLIC_SPONSOR_MODE=enoki` / `EXPO_PUBLIC_SPONSOR_MODE=enoki` | `…_SPONSOR_MODE=self` + `SPONSOR_SECRET_KEY` on the indexer |
| Endpoints | `POST /sponsor`, `POST /sponsor/execute` | `GET /sponsor/self`, `POST /sponsor/self` |
| Client call | `sponsorAndExecute` | `selfSponsorAndExecute` (both via `executeGasless(mode, …)`) |
| Who signs first | Enoki builds gas, then the user signs | The user signs the final bytes, then the sponsor co-signs |
| Gas source | Enoki's gas pool | The sponsor key's SUI **address balance** (`payment = []`) |
| Concurrency | Managed by Enoki | Nothing to manage: no gas-coin objects, so no equivocation or coin locking. The `ValidDuring` expiration (with a nonce) is the replay guard |
| Allowlist | Request `allowedMoveCallTargets` **and** the Enoki portal | Code only (`checkSelfSponsorable`), so new targets (savings #15, `address_alias` #10) ship with the code |
| Abuse controls | Allowlist | Allowlist, gas-coin and sponsor-object guards, a budget cap per tx (`SPONSOR_MAX_GAS_BUDGET`), a per-sender rate limit, and a rolling daily cap (`SPONSOR_DAILY_BUDGET`) |
| Secrets | `ENOKI_PRIVATE_API_KEY` | `SPONSOR_SECRET_KEY` (an Ed25519 key holding real SUI on mainnet) |
| Ops | Enoki account and plan, portal allowlist | Keep the address balance topped up (`sponsor:fund`) and watch it; rotate the key if it leaks |
| Passkey senders | Protocol-level fine; the smoke test confirms it with your key | Works (the smoke test runs it) |

## What the self-run sponsor checks

`checkSelfSponsorable` in `packages/core/src/auth/self-sponsor.ts` runs on the
exact bytes the user signed. It rejects:

- a sender that is the sponsor, a gas owner that isn't, and gas paid with coin objects
- a gas budget over the cap, and a missing or unbounded `ValidDuring` window, or one longer than 2 epochs
- any move call outside the allowlist (ReeF's package, Predict, messaging, and the `0x2` coin plumbing), and any `Publish`/`Upgrade`
- **the gas coin as an argument.** With address-balance gas it *is* the sponsor's balance, so `splitCoins(tx.gas, …)` would drain it
- any `FundsWithdrawal` from the sponsor, and any input object the sponsor owns

Unit tests: `packages/core/src/__tests__/self-sponsor.test.ts` (policy) and
`services/indexer/src/__tests__/sponsor-self.test.ts` (route).

## Cost

Network gas is the same either way. The same PTB costs the same computation and
storage. The differences are:

- **Enoki** adds whatever your Enoki plan charges for sponsored transactions (check the Enoki portal for current pricing). Gas is paid from Enoki's pool.
- **Self-run** has no per-transaction fee. ReeF pays the network gas from its own address balance, plus hosting it already pays for (the indexer). The real cost is ops: funding, monitoring and key custody.

Measured on testnet by `pnpm --filter @umbra/indexer sponsor:smoke` for one
`follow::create_follow_set` (net gas = computation + storage − rebate):

| Case | Net gas (MIST) |
|---|---|
| self-run · Ed25519 sender | _run the smoke test_ |
| self-run · passkey sender | _run the smoke test_ |
| Enoki · passkey sender | _needs `ENOKI_PRIVATE_API_KEY`_ |
| Enoki · Ed25519 sender | _needs `ENOKI_PRIVATE_API_KEY`_ |

## Recommendation

- Keep **Enoki as the default** for now. It is already wired into the portal and production.
- Turn on the self-run sponsor (`SPONSOR_SECRET_KEY`) on the indexer anyway. It is the **fallback when Enoki is down or rate-limits**, and the faster path for new move-call targets that would otherwise wait on a portal change.
- Before mainnet: bind `sender` to an authenticated session (a signed nonce) so neither endpoint sponsors arbitrary throwaway senders, and alert when the address balance runs low.

## Running the smoke test

```bash
# 1. a sponsor key with SUI (testnet: https://faucet.sui.io), in .env as SPONSOR_SECRET_KEY
pnpm --filter @umbra/indexer sponsor:fund 1     # move 1 SUI into its address balance
# 2. optional: ENOKI_PRIVATE_API_KEY in .env to add the Enoki cases
pnpm --filter @umbra/indexer sponsor:smoke
```

Each case sends from a brand-new sender holding no SUI. Passkey senders use the
software authenticator in `services/indexer/src/dev/software-passkey.ts`, which
produces the same WebAuthn signature format as a phone. The aliased zkLogin
sender case lands with #10.
