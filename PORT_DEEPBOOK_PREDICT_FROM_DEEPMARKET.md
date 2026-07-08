# Porting DeepBook Predict (DeepMarket → ReeF)

> **Audience: the AI implementing this inside the ReeF (`mystery`) repo.**
> Goal: bring DeepMarket's full DeepBook Predict surface (custom-strike options,
> redeem, range bands, LP vault, analytics) into ReeF, reusing ReeF's existing
> gasless + Google-sign-in plumbing. **This is a design guide, not applied code.**

Source of truth for the DeepMarket implementation (read these as you port):
`C:\Users\HP\Documents\sui\deepmarket\deepmarket\src\lib\predict.ts`,
`predict-tx.ts`, `svi.ts`, and the `components/Predict*`, `Vault*`, `Surface*`,
`Pnl*`, `VolSurface*`, `Leaderboard*` files.

---

## 0. The key fact that makes this easy

**DeepBook Predict is NOT a DeepMarket contract.** It is Mysten's *deployed*
package + public REST server. DeepMarket is just a client of it. So "porting" is
almost entirely **copying TypeScript** (tx builders + server fetchers + UI) — no
Move, no new indexer endpoints. Everything talks to:

| Thing | Value (testnet) |
|-------|-----------------|
| Predict package | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` |
| Predict shared object | `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a` |
| Predict registry | `0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64` |
| dUSDC (quote/collateral) | `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC` |
| PLP (LP share) | `0xf5ea2b37…::plp::PLP` |
| Public server | `https://predict-server.testnet.mystenlabs.com` |
| Clock | `0x6` |

ReeF already hard-codes the first few in `apps/web/lib/predict.ts` — confirm they
match (they did at time of writing).

### Scales (get these wrong and every number is off by 1000×)
- **Strikes & prices**: 1e9-scaled u64. `$50,000 → 50_000 * 1e9`. `usd = raw / 1e9`.
- **dUSDC quantity / cost / payout**: 1e6-scaled (6 decimals). `1_000_000 = 1 contract = $1 max payout`.
- **SVI params** (a,b,rho,m,sigma): 1e9-scaled u64 **with separate sign flags**
  `rho_negative` / `m_negative`. See `deepmarket/src/lib/svi.ts` → `sviFromUpdate`.

---

## 1. What ReeF already has (don't rebuild it)

`apps/web/lib/predict.ts` + `predict-tx.ts` + `use-predict.ts` already implement
the **gasless binary mint** path:

- `listMarkets`, `getOracleState`, `getOraclePrices`, `getOracleTrades`
- `findManagerByOwner`, manager-id cache, `extractManagerIdFromChanges`
- `buildCreateManagerTx`, `buildDepositMintTx`
- `usePredict()` — auto-creates the PredictManager, then deposit+mints **one $1
  contract** through `useGasless()` (Enoki sponsor). This is the proven pattern;
  every new write path below plugs into the same `gasless(tx)` call.

**The execution model is already solved.** The work is widening the feature set,
not re-inventing how to sign/sponsor.

---

## 2. The one piece of new wiring per feature: the sponsor allow-list

`useGasless()` (`apps/web/lib/gasless.ts`) ships the tx to the sponsor
(`services/indexer/src/sponsor.ts`), which calls Enoki with
`allowedMoveCallTargets`. **Enoki rejects the whole tx if ANY move call in the PTB
is not on that list.** Today the list is `umbraAllowedTargets(env.umbra.packageId)`
— ReeF's own package only. Predict targets are absent, so the *existing* binary
mint only works if Predict targets were already added (verify!). For each feature
you add, every `target` its PTB calls must be allow-listed.

**Add a Predict allow-list** in `services/indexer/src/sponsor.ts` (or extend
`umbraAllowedTargets`). Full set across all features below:

```
${PREDICT_PKG}::predict::create_manager
${PREDICT_PKG}::predict_manager::deposit
${PREDICT_PKG}::predict_manager::withdraw
${PREDICT_PKG}::market_key::new          // pure constructor, still must be listed
${PREDICT_PKG}::range_key::new           // pure constructor, still must be listed
${PREDICT_PKG}::predict::mint
${PREDICT_PKG}::predict::redeem
${PREDICT_PKG}::predict::mint_range
${PREDICT_PKG}::predict::redeem_range
${PREDICT_PKG}::predict::supply          // LP vault deposit
${PREDICT_PKG}::predict::withdraw        // LP vault cash-out
${PREDICT_PKG}::predict::refresh_oracle_mtm  // precedes supply/withdraw
```

> `market_key::new` / `range_key::new` are pure (return a key struct) but they are
> still move calls **inside the PTB**, so they must be on the allow-list or the
> sponsor rejects the mint/redeem.

> devInspect previews (`get_trade_amounts`, `get_range_trade_amounts`,
> `unsettled_exposed_oracles`) are **read-only `devInspectTransactionBlock`** — they
> never touch the sponsor and need no allow-list. Keep them client-side as-is.

---

## 3. The thing gasless does NOT solve: dUSDC collateral

Sponsorship pays **gas**. Predict trades are collateralised in **dUSDC**, which the
user must actually hold. A Google/zkLogin user with a brand-new address has zero
dUSDC, so mint aborts even though gas is free.

**You must give zkLogin users a dUSDC on-ramp.** Options, easiest first:
1. A **sponsored faucet move-call** (if the dUSDC package exposes a public mint on
   testnet) — add its target to the allow-list and a "Get test dUSDC" button.
2. A **server drip**: the sponsor service holds a dUSDC-funded key and transfers a
   small amount to the new address on first sign-in.
3. Manual: tell the user to claim dUSDC from Mysten's faucet (bad UX, demo only).

DeepMarket sidesteps this because its users bring funded wallets. ReeF's whole
pitch is "no wallet" — so this faucet is **required**, not optional. Flag it early.

---

## 4. Feature-by-feature port plan

Each item: copy the builder/fetcher from DeepMarket, run writes through
`gasless(tx)` with `tx.setSenderIfNotSet(addr)` (so `coinWithBalance` can resolve
dUSDC during the `onlyTransactionKind` build — ReeF already does this in
`use-predict.ts:55`), and allow-list its targets.

### 4a. Custom strike + size (upgrade the existing mint)
ReeF hard-codes `BET_QTY = 1 contract`, `$1` deposit. DeepMarket lets the user pick
**strike** (snapped to the oracle's `tick_size` grid from `min_strike`), **UP/DOWN**,
**quantity**, and **deposit**. Reuse `buildDepositMintTx` (already in ReeF — it
already takes `strike`/`quantity`/`depositAmount`); just build real UI inputs and a
**price preview** (4d) instead of fixed values.

### 4b. Redeem (sell / claim) — `buildRedeemTx`
Copy `buildRedeemTx` from `deepmarket/src/lib/predict-tx.ts`. Payout flows back into
the manager's dUSDC balance. Works pre-expiry (sell) and post-settlement (claim).
Allow-list `market_key::new` + `predict::redeem`.

### 4c. Manager cash-out — `buildWithdrawTx`
`predict_manager::withdraw` returns a `Coin<dUSDC>`; transfer to the user. Lets them
pull winnings/idle collateral back to their (zkLogin) address. Allow-list
`predict_manager::withdraw`.

### 4d. Price preview (devInspect) — `buildPreviewTx`
`predict::get_trade_amounts` via `devInspectTransactionBlock`. Returns per-unit
(cost, payout) so the UI shows "you pay $X for $Y max payout" before signing.
**No sponsor, no allow-list.** Out-of-band strikes *abort* — treat an abort as
"strike not quotable" (this is also how you discover the real ask-bounds, since the
server returns `ask_bounds: null`, see §6).

### 4e. Portfolio reads — `getManagerSummary`, `getManagerPositions`
Server endpoints `/managers/:id/summary` and `/managers/:id/positions/summary`
(**binary positions only**). Drive a positions table + account value / PnL header.
`findAllManagersByOwner` if you want to support multiple managers per address.

### 4f. Range positions (vertical bands)
`buildDepositMintRangeTx`, `buildRangePreviewTx`, `buildRedeemRangeTx` from
DeepMarket. Pays `$1·qty` if settlement lands in `(lower, higher]`. **Gotcha:** the
server has **no range-positions endpoint** — read them on-chain via
`getManagerRangePositions` (walks the manager's `range_positions` Table dynamic
fields; copy it verbatim from `predict.ts`). Allow-list `range_key::new` +
`predict::mint_range` / `predict::redeem_range`.

### 4g. LP vault (be the maker) — `buildSupplyTx`, `buildWithdrawLpTx`
`predict::supply` mints PLP shares; `predict::withdraw` burns them. Both assert the
vault MTM is fresh, so each is preceded by `refresh_oracle_mtm` for currently-
exposed **live** oracles — get that list from `getUnsettledExposedOracles`
(devInspect) and filter to non-expired. Read vault state with `getVaultStats`
(straight `getObject` on the Predict object — no server) and the user's position
with `getLpPosition`. Allow-list `predict::supply`, `predict::withdraw`,
`predict::refresh_oracle_mtm`. (Copy `VaultPanel` / `VaultRiskPanel` /
`WithdrawalLimiterViz` if you want the LP dashboard.)

### 4h. Analytics (pure reads, no chain writes)
- **SVI vol surface**: `latest_svi` + `deepmarket/src/lib/svi.ts` → `SurfaceStudio`
  / `VolSurfaceChart`.
- **PnL series**: `/managers/:id/pnl?range=…` → `getManagerPnl` → `PnlChart`.
- **Leaderboard**: `getLeaderboard` (fans out `/managers` summaries).
- **Trade tape**: `/trades/:oracleId` → `getOracleTrades` → `TradeTape`.
- **Full oracle browser**: `listAllOracles` (3-min cache; the `/oracles` endpoint
  returns ~2,800 BTC oracles and takes 15–30s — keep the cache).

---

## 5. Adapting to ReeF's stack (mechanical differences)

- **Next.js, not Vite.** DeepMarket reads `import.meta.env.VITE_*`; ReeF uses
  `process.env.NEXT_PUBLIC_*` and `"use client"` directives. Predict constants are
  already inlined in ReeF's `predict.ts`, so mostly you copy *function bodies*, not
  config plumbing.
- **No `CONFIG` object.** DeepMarket pulls ids from `CONFIG.PREDICT_*`; ReeF inlines
  them as module consts (`PREDICT_PKG`, `DUSDC_TYPE`, …). Replace `CONFIG.X` with the
  ReeF const when copying a function.
- **Execution: always `useGasless`**, never dapp-kit's `useSignAndExecute`. DeepMarket
  signs with a connected wallet; ReeF signs with the Enoki zkLogin wallet directly
  (the "don't sign with the current wallet" caveat is already handled in
  `apps/web/lib/gasless.ts`). Wrap each new write in a hook like `usePredict()` does.
- **dUSDC decimals = 6**, PLP decimals = 6, strikes/prices = 1e9. Centralise these
  as consts (ReeF has `PRICE_SCALE`/`toUsd` already; add `QTY_SCALE = 1e6`).

---

## 6. Gotchas (all verified in DeepMarket, will bite the same way here)

- **Oracles are BTC-only.** ~2,800 oracles on this Predict instance, all BTC. No SUI/
  ETH. Don't promise "predict any asset" — it's BTC strikes/expiries only.
- **`ask_bounds` is always `null`** from the server. The real quotable band is on-
  chain only: probe with `get_trade_amounts` (devInspect) — a value means in-band,
  an abort means out-of-band. Snap strikes to the tick grid before quoting.
- **Range positions aren't in the server** — on-chain read only (§4f).
- **Manager create is 2 signatures.** `predict::create_manager` shares the manager
  internally and returns only an id, so you can't compose create+mint in one PTB.
  ReeF's `usePredict()` already handles this: gasless-create, then poll
  `findManagerByOwner` until the indexer sees it, cache the id. With **sponsored**
  execution you get back only a digest — keep the poll approach; do NOT rely on
  `objectChanges` from the execute response (it may not carry them). If you need the
  id from effects, `getTransactionBlock({ digest, options:{ showObjectChanges:true }})`
  and run `extractManagerIdFromChanges`.
- **`setSenderIfNotSet(addr)` before building** any tx that uses `coinWithBalance`
  (deposit/mint/supply) — otherwise the dUSDC coin can't be resolved during the
  `onlyTransactionKind` build and sponsorship fails.
- **Sponsor gas budget is per Enoki project.** Predict mints + LP refreshes can be
  multi-command PTBs (more gas). Monitor the budget; consider a per-address rate
  limit on `/sponsor`.

---

## 7. Suggested build order (smallest shippable steps)

1. **Verify the existing binary mint actually sponsors** — add Predict targets to
   the sponsor allow-list, sign in with Google, place one $1 BTC bet end-to-end.
   (If this already works, the allow-list is partly done.)
2. **dUSDC faucet** for zkLogin users (§3) — nothing else matters until users can
   fund. Ship this second.
3. **Custom strike + qty + price preview** (4a + 4d) — turns the fixed $1 toy into a
   real options ticket.
4. **Redeem + withdraw** (4b + 4c) — close the loop so users can realise winnings.
5. **Portfolio** (4e) — positions table + account value.
6. **Range positions** (4f) — incl. the on-chain reader.
7. **LP vault** (4g) — supply/withdraw + vault dashboard.
8. **Analytics** (4h) — SVI surface, PnL, leaderboard, trade tape.

Each step is independently demoable. Stop wherever the scope ends.

---

## 8. Definition of done (per step)

- [ ] Every move-call target the PTB uses is on the sponsor allow-list
- [ ] Write path runs through `useGasless()` with `setSenderIfNotSet(addr)`
- [ ] Reads use the public server (or on-chain for range/vault) — no new indexer work
- [ ] zkLogin user with a freshly-funded dUSDC balance completes the flow gas-free
- [ ] Scales correct: strikes/prices ÷1e9, dUSDC ÷1e6 on display
- [ ] `next build` / typecheck clean
