# USDC Savings on Sui (flexible + time-locked tiers): product and engineering design for ReeF

Scope: design options and tradeoffs for a consumer USDC savings feature in ReeF (Sui social app, Lagos-first, Google zkLogin via Enoki, all txs Enoki-sponsored behind a move-call allowlist, `@mysten/sui` 2.19 gRPC, Next.js + Expo, own Move package). Date: 2026-11-02.

How to read these notes:
- **Cited Findings** come from fetched or searched sources.
- **Inferences** are my own design reasoning, built on the cited facts and on the repo code.
- Any claim marked **[unverified]** came from my training knowledge and was not re-checked this session.

Repo grounding (read-only):
- `services/indexer/src/sponsor.ts` builds the Enoki allowlist as `[...umbraAllowedTargets(packageId), ...predictAllowedTargets(), ...messagingAllowedTargets()]` and passes it as `allowedMoveCallTargets` on every `/sponsor` call.
- Adding savings means adding a `savingsAllowedTargets()` set. The set depends on the architecture chosen: ReeF's own package targets for (b) and (c), protocol targets for (a).
- `packages/move/sources` currently holds only `follow`, `post`, `profile` and `registry`. There is no existing vault or coin-handling Move code to reuse.

---

## 1. Architecture options: (a) non-custodial passthrough, (b) app-owned pooled vault, (c) per-user owned SavingsAccount

### Takeaway
Option (a) gives the lowest custody/regulatory exposure and the least code, but it cannot natively enforce a time lock or pay a boost. Option (b) is the most powerful, and it is also the highest-risk: it holds pooled customer funds, which makes it the closest thing to a deposit-taking product. The option that fits ReeF best is (c), a hybrid: a user-owned `SavingsAccount` or `Lock` object that wraps the protocol receipt token (sCoin, cToken or NAVI position) inside an owned object. Only the user can move it. The app enforces the lock and adds boosts, and it never pools funds.

### Cited Findings
- Scallop's supply receipt (sCoin / MarketCoin) is a fungible token. Its exchange rate is total underlying divided by total sCoin supply, and redemption pays sCoin × rate. The rate rises as borrowers pay interest. — [deepwiki scallop-io/sui-lending-protocol 4.1](https://deepwiki.com/scallop-io/sui-lending-protocol/4.1-supplying-and-redeeming-assets-(minting-scoin)) (search snippet; a direct fetch returned HTTP 429)
- Scallop example: a 1 sSUI = 1.1 SUI rate at deposit, with 12% APR supply interest, grows to about 1.111 SUI after a month. — [Scallop Medium: sCoins](https://medium.com/scallopio/scallop-feature-scoins-b53b4473d757)
- In Suilend, `deposit_liquidity_and_mint_ctokens` "accepts coins of the same type as the reserve and mints cTokens proportional to the deposit". While the cToken is held, any increase in pool value is reflected when it is redeemed. — [Zellic Suilend audit: deposit_liquidity_and_mint_ctokens](https://reports.zellic.io/publications/suilend/sections/3-reserve-function-deposit-liquidity-and-mint-ctokens-deposit-liquidity-and-mint-ctokens); [Zellic: Flow: Earning interest](https://reports.zellic.io/publications/suilend/sections/1-lending-market-flow-earning-interest-earning-interest)
- NAVI's write entry point is the `lending_core::incentive_v3` module (deposit, withdraw, borrow, repay, claim). `entry_deposit` deposits a chosen coin type. In SDK code it takes the Clock, the Storage object, a pool, the amount, and the incentive V2 and V3 objects. — [NAVI dev docs: lending core](https://naviprotocol.gitbook.io/navi-protocol-developer-docs/smart-contract-overview/lending-core); [navi-sdk 1.6.13 commonFunctions.js](https://app.unpkg.com/navi-sdk@1.6.13/files/dist/libs/PTB/commonFunctions.js)
- An older community gist calls `incentive_v2::entry_deposit` instead, so the module version has changed over time. The current SDK is `@naviprotocol/lending`, which has PTB builders. — [gist sunguru98](https://gist.github.com/sunguru98/b0aa6e2ffeb7d8b0da8a4dd0ffc03f03); [sdk.naviprotocol.io](https://sdk.naviprotocol.io/)
- Coinbase frames USDC yield as "rewards", not interest, and states that USDC balances "are not considered deposit accounts" and are not FDIC/SIPC insured. A commentator argues the "rewards" framing is a regulatory choice; that is opinion. — [Coinbase help: Boosted USDC rewards](https://help.coinbase.com/en/coinbase/derivatives/boosted-usdc-rewards); [tildes discussion](https://tildes.net/~finance/1aog/coinbase_what_if_we_call_them_rewards_instead_of_interest_payments)
- PiggyVest's Flex Dollar runs its USD virtual accounts through Oval Technologies Ltd, described as a CBN-licensed IMTO. Incumbent Nigerian dollar-savings products sit on licensed partners. — [brands.ng PiggyVest review 2026](https://brands.ng/piggyvest-review-2026-is-it-safe-legit-worth-it-for-nigerians/) (third-party)

### Inferences

**Option (a): non-custodial passthrough.** The client builds a PTB that calls protocol functions directly, and the receipt token (for example sUSDC or a Suilend cUSDC) lands in the user's zkLogin address.
- Custody: none. The app never touches the funds, which keeps it closest to a "software interface" posture.
- Gas: one tx per action, no extra objects.
- Composability: the receipt is a plain Coin (Scallop) and can be used elsewhere.
- Upgrade risk: borne by the protocol. ReeF has no Move code at risk.
- Accounting: read the protocol's exchange rate and multiply by the balance. The indexer must track cost basis per user to show "earned".
- Downsides:
  - A time lock cannot be enforced, because the user holds a free token.
  - No app-funded boost is possible without an off-chain rewards ledger.
  - The Enoki allowlist must include third-party targets such as `<scallop_pkg>::mint::mint`, `<navi_pkg>::incentive_v3::entry_deposit` and `<suilend_pkg>::lending_market::...`. These change when the protocol upgrades: NAVI already went v2 to v3, and the package ID moves with each upgrade [unverified for the current IDs]. That is a silent break risk for sponsorship.
- NAVI positions are not a transferable coin. They are recorded against the sender address or an AccountCap in the protocol's storage [unverified detail]. Wrapping them under (c) therefore needs NAVI's AccountCap pattern; Scallop's sCoin is the easiest to wrap.

**Option (b): app-owned shared Vault.** A shared `Vault<USDC>` holds the pooled `Balance<USDC>` and/or protocol receipts, and mints `Coin<VAULT_SHARE>` or per-user receipt objects.
- Pros:
  - One integration point, so only ReeF package targets go on the allowlist, and the allowlist stays stable across protocol upgrades because ReeF adapts internally.
  - The vault can rebalance across protocols, add boosts, and support fixed-term tranches.
- Cons:
  - **Custody and regulatory exposure.** Pooled user funds under an admin/upgrade cap look like a collective investment scheme or deposit-taking. Nigeria's SEC/CBN posture on VASPs is relevant here [unverified, legal review needed].
  - **Shared-object contention.** Every deposit and withdrawal goes through consensus on one object, which contradicts D-1 (owned-first). Low frequency makes this tolerable.
  - **Upgrade risk.** The package UpgradeCap can change logic over pooled funds, so it should be held in a multisig or timelock, or the package made immutable after audit.
  - **Accounting.** Needs ERC-4626-style share math, with inflation-attack mitigation (see section 3).
  - **Audit.** Mandatory before mainnet.

**Option (c): owned SavingsAccount / Lock objects (recommended hybrid).** The user owns `SavingsLock { id, owner, receipt: Balance<sUSDC> or protocol position, principal_usdc, start_ms, unlock_ms, tier, boost_bps }`.
- Deposit PTB: `scallop::mint` (USDC to sCoin), then `reef::savings::lock(sCoin, tier, &Clock)`. This needs both the protocol target and ReeF's target on the allowlist. Alternatively `reef::savings::deposit` calls Scallop internally via a Move dependency, so only the ReeF target is allowlisted, but ReeF then has to re-publish when Scallop's interface changes.
- Pros:
  - Owned-object fast path, consistent with D-1.
  - No pooling: each user's funds are isolated in their own object.
  - A time lock is enforceable, because the object has `key` only (no `store`), so it can't be transferred and only the ReeF module can unwrap it.
  - Clean per-user accounting.
- Cons:
  - Funds are inside ReeF module logic, so a bug or upgrade can still lock funds. This is a partial custody argument: "the code decides when you can withdraw".
  - Each lock is its own object, which carries a storage deposit (rebated on delete).
  - Rebalancing across protocols per user is costly.
- Flexible tier under (c): either plain (a) with the user holding sUSDC directly, or a `SavingsAccount` with no unlock. The simplest choice is that flexible is option (a) and locked is option (c).

### Gaps
- Current mainnet and testnet package IDs and entry function names for Scallop, Suilend, NAVI and AlphaLend were not fetched. The deepwiki fetch was rate-limited (429).
- Nigerian legal classification of a pooled-vault vs a non-custodial interface (SEC Nigeria digital asset rules, ISA 2025) was not researched. It needs counsel.
- Whether Suilend cTokens are exposed as a transferable `Coin<CToken<P,T>>` or only inside an Obligation was not confirmed from source.

---

## 2. Time locks in Sui Move: mechanism, penalties, and how locked tiers can actually earn more

### Takeaway
Implement the lock as an owned, non-`store` receipt with `unlock_ms` checked against `sui::clock::Clock` (`0x6`). Locked tiers can only honestly pay more if:
- there is a real source of extra yield (fixed-rate protocol, longer-duration strategy, partner incentives), or
- the app funds a boost from revenue.

Otherwise the lock is purely a commitment device, which is fine (PiggyVest SafeLock and Target were built on that), but it must be labeled honestly. Incumbents use "forfeit accrued interest (+ small fee)" as the early-break penalty, and ReeF should mirror that in Move.

### Cited Findings
- **PiggyVest Target Savings:** breaking before maturity loses accrued interest plus a 1% processing fee; a "locked target" cannot be broken at all and is accessible only at maturity. Advertised rates: Target 12% p.a., SafeLock "up to 18.5% p.a. depending on how long you lock". — [PiggyVest blog: how interest rates work](https://blog.piggyvest.com/save/how-piggyvest-interest-rates-work/); rates also in [TechCabal 2025 roundup](https://techcabal.com/?p=174002)
- **PiggyVest SafeLock:** a third-party review reports a 5% penalty plus forfeiture of accrued interest for early break when interest-at-maturity was chosen. Not confirmed against PiggyVest's own materials. — [brands.ng](https://brands.ng/piggyvest-review-2026-is-it-safe-legit-worth-it-for-nigerians/)
- **PiggyVest SafeLock interest timing:** interest has been paid upfront when funds are locked. This is a strong "watch it grow"/instant-gratification hook. — [TechCabal 2020: Safelock security](https://techcabal.com/2020/09/10/the-backend-piggyvest-engagement-safelock-security/)
- **PiggyVest rate basis:** rates track the CBN Monetary Policy Rate. — [PiggyVest blog](https://blog.piggyvest.com/save/how-piggyvest-interest-rates-work/)
- **Binance Simple Earn locked products:** early redemption forfeits all rewards received; funds return within 48 to 72 hours; flexible redemption is instant; some locked products don't allow early exit. — [Binance: Get started with Locked Products](https://www.binance.com/en/support/faq/af607a50de614350ae57be3e6f616699)
- **Binance early-redemption rebate (2022):** a 5% rebate of forfeited rewards was rolled into a new 90-day lock. This may no longer apply. — [Binance announcement](https://www.binance.com/en/support/announcement/8ca320bd0977491297a51a8494dbbe23)
- **Binance fixed-rate stablecoin promos** (for example FDUSD locked at 15.9% fixed APR) show that "locked = higher" is often an exchange-subsidized promo. — [blockchain.news](https://blockchain.news/news/binance-launches-fdusd-locked-products-15-9-fixed-apr)
- **Risevest Fixed Income:** USD, 3/6/12-month terms, ~10% p.a. historical, interest paid at maturity. Backed by sovereign dollar Eurobonds, which is a real duration premium. — [Risevest fixed income](https://risevest.com/fixed-income)
- **Cowrywise:** locked plans are withdrawable only on or after maturity; the Emergency plan can be withdrawn anytime; withdrawals are processed about 24h after initiation. — [Cowrywise help: withdraw](https://help.cowrywise.com/en/articles/1624265-how-to-withdraw-matured-funds-on-cowrywise); [Cowrywise plan types](https://help.cowrywise.com/en/articles/1624208-types-of-savings-plans-on-cowrywise)

### Inferences

**Move pattern [Move API facts unverified in-session but standard].**
`sui::clock::timestamp_ms(&Clock)` gives on-chain time, and the Clock is shared object `0x6`, passed by immutable reference so it doesn't add contention.

```move
public struct SavingsLock has key {        // no `store` => non-transferable, only this module unwraps
    id: UID, owner: address,
    receipt: Balance<SUSDC>,                // or protocol position / Balance<USDC> for the mock vault
    principal: u64, start_ms: u64, unlock_ms: u64, tier: u8, boost_bps: u16,
}
public fun lock(c: Coin<SUSDC>, principal: u64, tier: u8, clock: &Clock, ctx: &mut TxContext): SavingsLock
public fun withdraw_matured(l: SavingsLock, clock: &Clock, ctx): Coin<SUSDC>      // assert!(now >= unlock_ms)
public fun break_early(l: SavingsLock, cfg: &Config, clock: &Clock, ctx): Coin<SUSDC> // penalty path
```

Return values rather than `transfer`ing inside the module, to fit the CLAUDE.md "public fun, compose in PTBs" rule. The PTB then does `transfer::transfer`. Note: with `key`-only, the module must do the transfer itself (`transfer::transfer` inside the module), because the PTB's `TransferObjects` requires `store`. A `public fun open_lock(...)` that transfers to `ctx.sender()` is cleaner.

**Penalty options:**
- Forfeit yield earned to date: on break, return `principal` worth of sUSDC and send the excess to a treasury or to the remaining lockers. This is the PiggyVest/Binance norm and easy to explain.
- Additionally a flat 1% fee (PiggyVest Target norm).
- Never touch principal beyond a small fee. That is a consumer-trust red line for a Lagos audience burned by schemes [inference].

**Hard lock vs soft lock.** PiggyVest offers both "breakable target" and "unbreakable locked target". Offer `breakable: bool` on the object. An unbreakable lock should still have an admin emergency-unlock gated by a multisig, or none at all. Disclose which.

**How locked can genuinely earn more on Sui:**
- (i) Partner incentives: protocol liquidity-mining tokens. Claimed rewards (NAVI incentive_v3 claim, Scallop sSCA, Suilend SEND rewards) can be harvested by the app and paid as `boost_bps` only to locked users. This is real but volatile.
- (ii) App-funded boost from revenue (DeepBook trading fees, tips take-rate) paid into a `BoostPool` and distributed pro rata to lock duration. This is honest if labeled "ReeF bonus".
- (iii) Fixed-rate or term products: I found no confirmed fixed-rate USDC lending market on Sui as of late 2026 [gap]. Pendle-style yield tokenization would be the theoretical route.
- (iv) Longer-duration or less-liquid strategies (for example RWA T-bill tokens on Sui) [unverified availability].
- (v) Yield-forfeit redistribution: penalties from early breakers go to people who hold to maturity.

Without (i), (ii) or (v), locked APY is the same as flexible APY. Present it as "save with discipline" and not "earn more".

**Precedents:**
- Sui native staking: `StakedSui` is an owned object with an activation epoch, and rewards are realized on withdraw. It is an owned-receipt precedent, though it has no lock [unverified detail].
- The ve-token model (Curve veCRV): boost proportional to lock duration, decaying linearly. Lock-weighted boost = amount × remaining_ms / max_ms.
- Upfront-interest gimmick (PiggyVest): pay the boost portion upfront from the BoostPool on lock, and claw it back on break. Strong UX, but it requires a funded pool.

### Gaps
- No confirmed live fixed-rate USDC product on Sui found.
- Could not confirm current PiggyVest SafeLock penalty from a first-party page.
- Could not find open-source Sui lock-vault Move code (for example Kai or AlphaFi lockers) in-session.

---

## 3. Share accounting (ERC-4626-style) in Move, rounding and inflation pitfalls, and how Sui protocols represent shares

### Takeaway
If ReeF builds a pooled vault (option b), or wraps receipts, use 4626 math with u128 intermediates:
- `shares = assets * (total_shares + V) / (total_assets + 1)`
- Round down on mint and on redeem-to-assets, and round up on withdraw-to-shares.
- Use a virtual offset or dead shares to kill the first-depositor inflation/donation attack.

Under option (c), wrapping Scallop sCoin avoids writing share math entirely. The protocol's exchange rate is the share price, and ReeF only records `principal` for display and penalties.

### Cited Findings
- **Standard formula:** `shares = assets × totalSupply / totalAssets`. — [OpenZeppelin Stellar vault docs](https://docs.openzeppelin.com/stellar-contracts/tokens/vault/vault)
- **OpenZeppelin defense:** virtual shares/assets plus a decimals offset make the first-depositor inflation attack unprofitable even at offset 0, and higher offsets make it more costly. It avoids the cost of dead-share creation. — [OpenZeppelin: A novel defense against ERC4626 inflation attacks](https://www.openzeppelin.com/news/a-novel-defense-against-erc4626-inflation-attacks); [OZ ERC4626 docs](https://docs.openzeppelin.com/contracts/erc4626)
- **Caveat on offset 0:** a third-party (Hacken) report claims victims still lost 9 to 25% of deposits at offset 0, and that OZ calls the attack "non-profitable", not "prevented". Sources conflict on whether the default offset of 0 is sufficient. — [Hacken report](https://hackenproof.com/reports/OPENEDCA-112); [Zealynx: decimal offset](https://www.zealynx.io/glossary/decimal-offset)
- **XRPL single-asset vaults** use separate deposit and redemption exchange rates, so losses are shared fairly. This is a pattern for unrealized-loss handling. — [XRPL single asset vaults](https://xrpl.org/docs/concepts/tokens/single-asset-vaults)
- **Compound V2 analogue:** exchange rate = (cash + borrows − reserves) / supply. Supply changes only on mint/redeem; the rate grows with accrual. The Compound-fork "first deposit bug" is the same inflation class. — [Zealynx Compound V2 cToken interest](https://academy.zealynx.io/modules/compound-v2/ctoken-interest); [DeFiHackLabs: first deposit bug](https://defihacklabs.substack.com/p/solidity-security-lesson-2-first)
- **Scallop sCoin:** rate = underlying / sCoin supply. Suilend cTokens: minted proportional to deposit, value accrues to the rate. — [deepwiki Scallop](https://deepwiki.com/scallop-io/sui-lending-protocol/4.1-supplying-and-redeeming-assets-(minting-scoin)); [Zellic Suilend](https://reports.zellic.io/publications/suilend/sections/3-reserve-function-deposit-liquidity-and-mint-ctokens-deposit-liquidity-and-mint-ctokens)

### Inferences

**Move specifics:**
- USDC on Sui has 6 decimals [unverified but standard]. Use `u128` for `assets * shares` products to avoid u64 overflow on large pools.
- Move aborts on overflow, which fails safely but is a DoS vector, so test the boundaries.
- **Donation vector in Sui.** Anyone can't directly "send" to a `Balance` inside a shared object. But if `total_assets` is read from an external protocol position (for example sCoin held × the protocol rate), external manipulation of that rate is the attack vector. Track `total_assets` internally where possible.
- **Mitigation:** seed the vault at publish with dead shares, either minting to `@0x0` or keeping them in the vault (for example 1 USDC), and add a virtual offset (V = 10^3).
- **Shares as Coin vs object:**
  - `Coin<RUSDC>` via `coin::create_currency` or the newer coin registry [verify against the current Sui framework]. It is composable, but users can trade it away, which breaks per-user lock logic.
  - Per-user receipt objects suit locks better.
  - Recommendation: flexible tier = shares as `Coin` (or just the raw sCoin); locked tier = an owned `SavingsLock` holding shares.
- **Kai / AlphaFi:** representation was not verified in-session. My recollection is that AlphaFi issues per-pool receipt objects/coins and Kai vaults use yield-bearing coin shares [unverified]. Check their GitHub before citing.
- **Accrual freshness.** Scallop/Suilend/NAVI accrue interest on interaction using the Clock. The displayed balance should come from simulated accrual (`rate × (1 + r·Δt)`) client-side, and not only from the last-on-chain rate.

### Gaps
- Kai Finance and AlphaFi share representation not confirmed from source.
- Did not confirm whether Sui's 2025+ coin standard changes (Currency registry) affect `create_currency` for share coins.

---

## 4. Consumer UX patterns: Coinbase, Binance, PiggyVest, Cowrywise, Risevest, crypto neobanks

### Takeaway
The proven Nigerian pattern is:
- separate named "pots" (Flex = anytime, SafeLock/Target = locked, Goals),
- with an explicit rate per pot,
- auto-save,
- a clear maturity date,
- a plain-language early-break rule (lose interest + small fee).

Dollar savings is its own tier (PiggyVest Flex Dollar ~7%, Risevest ~10% fixed). The crypto pattern adds:
- a variable APY that is "subject to change",
- daily accrual with periodic payout,
- a "rewards, not interest" framing.

ReeF should combine the two: a Naira-equivalent display, a live ticking USDC balance, and "Flex" vs "Lock" pots with goal and auto-save.

### Cited Findings
- **Coinbase perps-portfolio USDC rewards:** up to 12% APY on balances up to $10K, the base rate above that, calculated and accrued daily, paid weekly, "subject to change or discontinuation". — [Coinbase help](https://help.coinbase.com/en/coinbase/derivatives/boosted-usdc-rewards)
- **Coinbase Wallet onchain USDC rewards:** 4.7% APY paid monthly on Base, varies by region. — [Coinbase blog](https://www.coinbase.com/blog/Coinbase-Wallet-USDC-Rewards)
- **Coinbase in 2019:** 1.25%, calculated in real time but credited monthly. — [CoinDesk 2019](https://coindesk.com/markets/2019/10/02/coinbase-to-pay-users-125-interest-on-usdc-stablecoin-holdings/)
- **Binance:** flexible redemption is instant; locked unlocks 1 day after term; early-redemption forfeits rewards; an "auto-subscribe" feature rolls positions over. — [Binance locked FAQ](https://www.binance.com/en/support/faq/af607a50de614350ae57be3e6f616699); [Binance auto-subscribe](https://www.binance.com/en/support/faq/ecd6f9f7aac0471fb792dc1792af8995)
- **PiggyVest product lineup:**
  - Flex: anytime.
  - Target: goal-based, 12%, breakable with interest loss + 1% fee, or "locked target" unbreakable.
  - SafeLock: up to 18.5% scaled by duration.
  - Flex Dollar: ~7%.
  - Rates are pegged to the CBN MPR.
  - Sources: [PiggyVest blog](https://blog.piggyvest.com/save/how-piggyvest-interest-rates-work/); [TechCabal 2025](https://techcabal.com/2025/08/22/fintech-apps-in-nigeria-with-competitive-interest-rates-on-savings/)
- **PiggyVest's engagement playbook:** SafeLock interest upfront, plus emphasis on lock as a discipline/security feature. — [TechCabal 2020](https://techcabal.com/2020/09/10/the-backend-piggyvest-engagement-safelock-security/)
- **Cowrywise:**
  - Regular plans and Halal plans are locked to maturity; Halal earns no interest, an interest-free variant for Muslim users (relevant in Nigeria).
  - The Emergency plan is withdrawable anytime.
  - A withdrawal fee is shown on the withdraw screen.
  - Processing takes 24h.
  - Sources: [Cowrywise help: plan types](https://help.cowrywise.com/en/articles/1624208-types-of-savings-plans-on-cowrywise); [Cowrywise Halal](https://cowrywise.com/blog/halal-accounts/)
- **Risevest Fixed Income:** pick 3/6/12 months; ~10% historical, "not guaranteed"; interest at maturity. — [Risevest](https://risevest.com/fixed-income); [App Store](https://apps.apple.com/us/app/rise-vest/id1486295645)

### Inferences

**Recommended screens:**
1. **Savings home.** Total in USDC with a ≈₦ equivalent (live FX), and a balance ticker that interpolates per second from APY.
2. **Pots:**
   - "Flex" (withdraw anytime, variable APY with a "rate changes daily" tooltip).
   - "Lock" with 1/3/6/12 month chips, each showing the base APY plus the "ReeF bonus" separately, so variable protocol yield is never conflated with a guaranteed boost.
3. **Goal + auto-save.** Recurring deposits can't be pulled from a self-custodial wallet without a signature. Options:
   - a reminder push plus a one-tap sponsored PTB;
   - auto-sweep a % of incoming tips (the social-native hook: "save 10% of every tip");
   - a delegated/session key [unverified feasibility with zkLogin].
4. **Break-early sheet.** "You'll get back $X (you lose $Y earned)". Preview the exact number from the on-chain penalty formula.

**Labeling and disclosure:**
- Call it "rewards"/"yield", not "interest" (Coinbase precedent).
- Show "Not a bank deposit. Not insured. Yield comes from lending on Scallop/NAVI."
- Nigerian users compare against 12 to 18% naira rates. USDC 4 to 8% looks low unless framed as dollar savings, where the benchmark is PiggyVest Flex Dollar at ~7% and Risevest at ~10%.

**Halal:** a 0% "Lock" tier (pure commitment, no lending) mirrors Cowrywise Halal and costs nothing to build.

**Crypto neobanks:** Ether.fi Cash, Kast and Lemfi UX was not researched in-session (gap).

### Gaps
- Ether.fi Cash, Kast and Lemfi savings UX not fetched.
- No first-party PiggyVest SafeLock penalty page.
- No fintech UX writeup on "ticking balance" retention effects found.

---

## 5. Gas sponsorship (Enoki allowlist) and USDC on-ramp in Nigeria

### Takeaway
Sponsorship works by adding savings targets to `allowedMoveCallTargets` in `sponsor.ts`. Option (c) with ReeF wrapper entry points minimizes third-party targets. On-ramp is the harder problem. Sui's docs list Banxa, Coinbase, OnRamp.money and Meld as USDC-on-Sui on-ramps, but none is confirmed for naira. The practical Nigerian path is likely NGN to USDC on an exchange, P2P or Yellow Card, then withdrawal to Sui. Network support on each provider must be verified.

### Cited Findings
- **Sui docs on-ramp table:**
  - USDC on Sui: Banxa, Coinbase, OnRamp.money, Meld.
  - SUI only: Stripe, Alchemy Pay, Onramper.
  - Stripe and Bridge.xyz list USDSui.
  - No country coverage is given ("Most providers restrict service in certain countries").
  - Source: [docs.sui.io Fiat On-Ramps](https://docs.sui.io/onchain-finance/asset-custody/fiat-on-ramps)
- **Coinbase Onramp in Slush:** buys USDC on Sui with card, bank or Apple Pay. Nigeria is not mentioned. — [Coinbase Developer Platform: Slush](https://www.coinbase.com/developer-platform/discover/launches/slush-wallet)
- **Yellow Card:** operates in Nigeria and ~20 countries. Sui USDC support is not confirmed. — [BusinessDay](https://clone.businessday.ng/?p=799014)
- **Nigerian stablecoin flow** (naira to USDC/USDT, then out) is described generally, with no Sui specifics. — [Codex: Stablecoin payments in Nigeria](https://codex.xyz/blogs/stablecoin-payments-in-nigeria-cross-border-fx-settlement-and-on-ramp-infrastructure); [Grey: USDC in Nigeria](https://grey.co/blog/how-to-convert-and-use-usdc-in-nigeria); [Breet: on-ramps in Nigeria](https://breet.io/blog/crypto-on-ramp-platforms-in-nigeria)
- **Native USDC on Sui** (Circle) is on mainnet and testnet. — [Sui blog: USDC on Sui](https://www.sui.io/blog/circle-usdc-available-on-sui.md); [Cryptonews 2024](https://cryptonews.com/news/native-usdc-available-on-sui-through-navi-protocol/)
- **Enoki docs:** the sponsored-transactions page only says sponsorship needs a private API key via the backend. The fetched page did not document allowlist semantics. — [Enoki docs](https://docs.enoki.mystenlabs.com/ts-sdk/sponsored-transactions)

### Inferences

**Allowlist work** (`services/indexer/src/sponsor.ts`): add `savingsAllowedTargets(env)`.
- Under (c) with a Move dependency: only `<reef_pkg>::savings::{deposit_flex, withdraw_flex, open_lock, withdraw_matured, break_early}`.
- Under (a)/(c) with a direct protocol call: also Scallop `mint::mint` / `redeem::redeem` and `accrue_interest`-style targets, NAVI `incentive_v3::entry_deposit` / `withdraw_v2`, and the oracle-update targets. NAVI withdrawals need Pyth/oracle price-update calls in the same PTB [unverified], and those must be allowlisted too.

**Sponsor-abuse surface.** Deposits and withdrawals are cheap. But wrapper functions that accept arbitrary `Coin<T>` could be spammed. Enforce the `T = USDC` type in Move, and rate-limit per sender in the sponsor endpoint.

**Gas coin.** With sponsorship, the user's USDC coin objects are inputs and the gas coin is Enoki's, so `splitCoins` must split from the user's USDC coin and not from `tx.gas`. This is the classic sponsored-PTB bug.

**Merging coins.** Users who receive many tips end up with fragmented `Coin<USDC>` objects. Build the deposit PTB with `mergeCoins` first. Fetch coins via the gRPC client in `packages/core/src/sui/client.ts`.

**On-ramp UX:**
- Phase 1: "Receive USDC on Sui" QR/address, plus a guide for Bybit/Binance P2P and Yellow Card withdrawal to the Sui network.
- Phase 2: embed Banxa, Onramper, Meld or OnRamp.money (OnRamp.money is India-origin but claims broad emerging-market coverage [unverified for NG]) after confirming NGN plus USDC-on-Sui support.
- Tips received inside ReeF are themselves an on-ramp into savings. This is the strongest organic funnel.

### Gaps
- Whether Yellow Card, Transak or Banxa support NGN to USDC on the Sui network as of 2026-11 was not confirmed.
- Enoki allowlist semantics (does it check only MoveCall targets, and are TransferObjects/SplitCoins always allowed?) were not documented on the fetched page. Confirm against the Enoki HTTP API reference and ReeF's existing working DeepBook Predict sponsorship.

---

## 6. Testnet strategy: protocols on testnet and a mock-yield vault

### Takeaway
I could not confirm any major Sui lending protocol running a stable public USDC market on testnet as of 2026-11. Plan on a ReeF-owned **mock-yield vault** on testnet that exposes the same interface as the production adapter. Then swap in Scallop (or NAVI/Suilend) on mainnet behind a TS adapter in `@umbra/core`.

### Cited Findings
- Circle native USDC exists on Sui testnet (per a 2024 article; could be stale). — [Cryptonews 2024](https://cryptonews.com/news/native-usdc-available-on-sui-through-navi-protocol/)
- A June 2026 Chainwire release about the "Hashi" coalition says a global testnet is coming in July 2026, listing AlphaLend, Bluefin, Current, Scallop and Suilend as day-one retail lending/borrowing protocols, with configs at sui.io/hashi. This is a press release; I did not verify that the testnet is live or what assets it carries. — [MetaTrader/Chainwire](https://www.metatrader.com/zh/news/chainwire/1778844-sui-news-cumberland-fluid-and-swissborg-join)
- NAVI's current SDK `@naviprotocol/lending` builds PTBs; testnet support was not confirmed. — [NAVI developers](https://naviprotocol.io/developers)

### Inferences

**Mock vault on testnet:** `reef::mock_yield` with a shared `MockVault { balance: Balance<USDC>, rate_bps_per_year, last_ms, index: u128 }`.
- The index accrues `index *= 1 + rate·Δt` on each interaction, using the Clock.
- `deposit` mints `Coin<MOCK_SUSDC>` at `amount / index`; `redeem` pays `shares × index`.
- Fund it from an admin "yield reserve" (use the existing `services/indexer/src/faucet.ts` pattern to top up testnet USDC).
- This gives a realistic exchange-rate receipt identical in shape to Scallop's sCoin, so the `SavingsLock` code is unchanged between test and production.

**Testnet USDC:** Circle's faucet (faucet.circle.com) supports Sui testnet [unverified], or ReeF mints its own `TEST_USDC` for testnet. The latter is simplest and avoids faucet rate limits.

**Adapter boundary:** `packages/core/src/savings/{index.ts, adapters/mock.ts, adapters/scallop.ts}` with an interface:
- `buildDeposit(tx, coin)`
- `buildRedeem(tx, receipt)`
- `exchangeRate()`
- `apy()`
- `allowedTargets()`

`allowedTargets()` feeds `sponsor.ts`. This keeps DeepBook/Predict-style integration consistent with `packages/core/src/deepbook`.

**Mainnet gating.** Per CLAUDE.md the project is testnet only; the mainnet savings launch needs an audit of the `savings` module plus a legal review.

### Gaps
- Live status of the Hashi testnet and whether Scallop, Suilend or NAVI have usable USDC markets on Sui testnet now are unconfirmed.
- AlphaLend/AlphaFi testnet presence unknown.
