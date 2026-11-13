# USDC savings (testnet, #15)

Non-custodial savings, following `docs/research/reports/USDC savings yield on Sui.md`.
ReeF never holds anyone's funds.

| Pot | How it works |
|---|---|
| **Flex** | The user deposits into the lender and holds the lender's **receipt coin** in their own address. They can withdraw any time the market has liquidity. |
| **Lock** (1, 3, 6 or 12 months) | A `SavingsLock` the user owns wraps their receipts. It's `key`-only, so it can't be transferred or unwrapped except through the module, and `unlock_ms` is checked against the Clock. |
| **Halal lock** (0%) | Same lock, but it holds the coin itself and never touches a lender. |

Rules, enforced in Move (`packages/savings/sources/savings.move`):

- **Breaking early forfeits the yield, never the principal.** The forfeit goes to a `BonusPool` for people who hold to maturity, never to ReeF (see the report's legal section).
- **If the lender's rate fell** (bad debt), breaking returns everything that's left instead of aborting.
- Locks can be made unbreakable (`breakable = false`). That's disclosed at creation.
- ReeF's parameters (the allowed coin type and durations) are in a **frozen** `SavingsConfig`, so nobody, ReeF included, can change the rules under an existing lock.
- Only the configured USDC type is accepted (`EWrongCoin`).

## Testnet lender: `mock_yield`

There's no confirmed lender on testnet, so `mock_yield` stands in. It's shaped
like Scallop's sCoin: deposit USDC, get a fungible receipt `Coin<MOCK_YIELD>`
whose exchange rate rises from a variable APR against the Clock. Yield is backed
only as far as the vault is topped up. Past that, redeeming aborts with
`ENotEnoughLiquidity`, the same failure a fully utilised market shows. It also
has admin knobs a real lender doesn't (`set_apr`, `haircut` for simulating bad
debt). Choosing the mainnet lender is part of #16. In TypeScript a real lender
plugs in behind `savings.SavingsAdapter`.

`test_usdc` is a **testnet-only** stand-in USDC with a public, capped faucet
(1,000 per call). The testnet dUSDC ReeF tips with has no public mint. The
vault and config are generic, so a deployment can choose any coin type (on
mainnet: Circle's USDC).

**Rounding:** receipts are minted rounded down at deposit, so up to
0.000001 USDC (1 base unit) per deposit stays in the vault. Every share-based
lender does this, because rounding up would let anyone mint free value. Previews
in the app use the same math (`savings.breakEarlyPreview`, `projectRate`).

## Deploy (testnet)

```bash
pnpm --filter @umbra/indexer savings:publish
#   env: SAVINGS_DEPLOYER_SECRET_KEY (keeps UpgradeCap + AdminCap), SUI_BIN=path/to/sui
#   publishes, creates the vault (5% APR mock) + frozen config, tops up 1,000 tUSDC,
#   writes packages/savings/deployments/testnet.json
```

Then set `SAVINGS_PACKAGE_ID` on the indexer, so the six savings entry points
and the test-USDC faucet are sponsored.

## Verified

- `sui move test --path packages/savings`: 10/10. Covers the rate rising with time, Flex earning, lock maturity, withdrawing before maturity (aborts), breaking early (principal back, yield forfeited to the pool), breaking after a rate drop (everything back, no abort), unbreakable locks, a non-USDC coin, unlisted durations, the Halal lock never touching the lender, and redeeming beyond liquidity.
- Core: `packages/core/src/__tests__/savings.test.ts` checks that the TypeScript math matches the Move code, and that the builders never touch the gas coin.
- **Live on testnet, gasless** (`savings:smoke`, 2026-11-13), for a brand-new user holding 0 SUI, with gas from the self-run sponsor:

| Step | Digest | Result |
|---|---|---|
| mint 100 tUSDC | `5VfyTdKX…` | ✅ |
| Flex deposit 40 | `Aw3M1KSu…` | ✅ holds 39.999998 receipts |
| open 1-month lock with 50 | `FBmgmmbi…` | ✅ |
| break the lock early | `BGtMamHU…` | ✅ got back 49.999999 (the 0.000001 is deposit rounding) |
| Flex withdraw all | `6Bj96XHi…` | ✅ got back 39.999999 |
| open Halal lock with 10 | `8zjo3bRh…` | ✅ |

## Still to build (follow-up PR on #15)

- **Indexer**: ingest `savings` events (positions, cost basis, accrued yield, trailing APY, per-user yield statements; gains are taxable in Nigeria from 1 Jan 2026).
- **UI**: Flex, Lock (1/3/6/12 months) and Goals pots, a live-ticking balance (`projectRate` each second), a ≈₦ equivalent, a "variable, not guaranteed" APY label, a break-early sheet with the exact numbers ("you get back $X, you give up $Y"), "not insured" copy, and never the words "interest", "guaranteed", "insured" or "risk-free".
