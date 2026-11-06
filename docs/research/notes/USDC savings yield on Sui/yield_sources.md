# USDC savings yield on Sui: where the yield comes from (as of 2026-11-02)

Method note: Live pool figures come from the DefiLlama Yields API (`https://yields.llama.fi/pools` and `https://yields.llama.fi/chart/{pool}`), pulled on **2026-11-02**. Protocol metadata and the hack list come from `https://api.llama.fi/protocols` and `https://api.llama.fi/hacks`, pulled the same day. Monthly averages are my own aggregation of DefiLlama daily points. On DefiLlama, a lending pool's "tvlUsd" is usually *available* (unborrowed) liquidity, not total supplied (inference, see below). All APYs are mainnet. Data for the November 2026 row is only 1–2 days old.

## 1. Lending markets accepting native USDC

### Takeaway
Native-USDC lending on Sui pays roughly **4–7% today**. Most of that is base interest from borrowers. Point-and-token incentives are now small (≤0.5%), except at Current, where the 6.97% headline is about 2.3% base plus about 4.7% in rewards. The sector is small and shrinking: about $356M lending TVL at the end of June 2026, with only about $95M of USDC supplied across all protocols. Withdrawal-liquidity risk is real. Some USDC pools have run at 82–94% utilisation.

### Cited Findings
**Sector-level (Datumlab, figures as of 30 Jun 2026)**
- Sector lending TVL was $446.7M on 1 May 2026 and **$355.6M on 30 Jun 2026**, down 20.4% over two months. June's drop was driven by supplier withdrawals. — [Datumlab State of Lending on Sui May–Jun 2026](https://www.datumlab.xyz/resources/reports/state-of-lending-sui-may-june-2026)
- 30 Jun TVL by protocol: NAVI $126.0M, Suilend $104.3M, Bucket $57.1M, AlphaLend $55.2M, Scallop $13.2M. — [Datumlab](https://www.datumlab.xyz/resources/reports/state-of-lending-sui-may-june-2026)
- Sector USDC market: **$94.7M supplied, $73.4M borrowed**. That is about 77% aggregate USDC utilisation (my calculation). Suilend USDC supply fell 12.3% (−$4.2M) in June, and NAVI USDC supply fell 5.0%. — [Datumlab](https://www.datumlab.xyz/resources/reports/state-of-lending-sui-may-june-2026)
- Utilisation in June, all assets: NAVI 37.4%, Suilend 32.7%, AlphaLend 49.0%, Bucket 27.3%, Scallop 52.3%. All-asset month-end supply yields: NAVI 1.44%, Suilend 1.16%. These are not USDC-specific. — [Datumlab](https://www.datumlab.xyz/resources/reports/state-of-lending-sui-may-june-2026)
- Datumlab reported no bad-debt events, oracle incidents or protocol pauses in May or June 2026. It did note a NAVI liquidation on 24 Jun that priced wUSDT collateral at $60,481 per unit; NAVI then added a $0.50–$2.00 price guard for stablecoins. It also noted a Bucket audit finding that risk parameters were stored in percent rather than fractions (since fixed). — [Datumlab](https://www.datumlab.xyz/resources/reports/state-of-lending-sui-may-june-2026)
- Current DefiLlama TVL (2026-11-02): Suilend $143.2M, NAVI Lending $137.4M, Current $56.0M, Bucket V2 $26.9M (plus Bucket CDP v1 $14.2M), Scallop Lend $9.0M, AlphaLend $0 (see below). — [DefiLlama protocols API](https://api.llama.fi/protocols)

**Live USDC supply rates (DefiLlama, 2026-11-02)**

| Protocol / pool | Base APY | Reward APY | Total | 30d mean | Pool "tvlUsd" |
|---|---|---|---|---|---|
| Current, USDC MainMarket | 2.27% | 4.60% | 6.87% | 7.04% | $18.9M |
| Current, USDC EmberMarket | 5.69% | 3.13% | 8.82% | 9.10% | $0.1M |
| NAVI, USDC | 6.37% | 0.33% | 6.71% | 5.83% | $2.7M |
| Scallop, USDC | 4.02% | – | 4.02% | 4.20% | $0.6M |
| NAVI, wUSDC (Wormhole, legacy) | 0.38% | 0 | 0.38% | – | $0.15M |
| Scallop, wUSDC (legacy) | 0.99% | – | 0.99% | – | $0.13M |
| Abyss, USDC (DeepBook Margin-linked) | 7.42% | – | 7.42% | 9.06% | $0.17M |

Source: [DefiLlama Yields API](https://yields.llama.fi/pools); pool IDs a0860ad8…, e6ba2561…, 0fddbf5d…, ddf68725…, 838df6ef…, b1d5ce92…, c8048777….

**Suilend**
- DefiLlama lists **no Suilend yield pools**, even though Suilend is the largest protocol at $143M TVL. — [DefiLlama Yields API](https://yields.llama.fi/pools)
- Rates as of 12 Oct 2026 (from a competitor's blog, on-chain derived, **unverified**): Main Market USDC about 4.38% base supply APR, about 6.65% borrow APR, **82.3% utilisation**, plus about 0.5% in sSUI incentives. Ember Market USDC about 5.71% base supply APR at **94.0% utilisation** (about 3.42M supplied, 3.21M borrowed). The legacy Wormhole USDC reserve has a deposit limit of 0 and 0% LTV, so only native USDC is accepted. — [JewelSwap Suilend guide](https://www.jewelswap.io/blog/how-to-use-suilend)
- Mechanics: deposits mint cTokens, whose exchange rate accrues interest. Positions sit in an Account NFT (an obligation owner cap). At 100% utilisation, withdrawals fail until borrowers repay. Each market has an hourly outflow limit: about $5M per hour for the Main Market and about $2M per hour for the Ember Market. Incentives are paid in two-week periods, mostly sSUI, plus BLUE in the Ember Market. — [JewelSwap](https://www.jewelswap.io/blog/how-to-use-suilend)
- Audits: Zellic and OtterSec (Mar 2024); Certora formal verification (Feb 2026). The page says 2025 losses were confined to isolated pools, without detail. — [JewelSwap](https://www.jewelswap.io/blog/how-to-use-suilend); audit index at [docs.suilend.fi/security/audit](https://docs.suilend.fi/security/audit)
- SDK: `@suilend/sdk` v14.2.0, published 2026-10-31. — npm registry (`npm view @suilend/sdk`)

**NAVI Protocol**
- USDC monthly average total APY (DefiLlama): 2025 ranged from 4.4% (Mar) to 12.9% (Nov); 2026 so far 4.7–5.9%; Oct 2026 5.73% (5.20% base + 0.53% reward). — [DefiLlama chart 0fddbf5d](https://yields.llama.fi/chart/0fddbf5d-ec14-4570-80d3-a70c85573d3e)
- SDKs: `@naviprotocol/lending` v2.1.0 (2026-10-29), plus legacy `navi-sdk` v1.7.3 (2026-03-04). — npm registry
- NAVI launched "NAVI Prime", an institutional lending framework (headline only; I did not read the article). — [crypto.news](https://crypto.news/navi-prime-launches-institutional-lending-on-sui/)
- DefiLlama's audit link for NAVI is a "Preliminary Audit Report" PDF on NAVI's gitbook. — [DefiLlama protocols API](https://api.llama.fi/protocols)

**Scallop**
- USDC base APY monthly average: 5.1–5.7% in H1 2026, falling to 2.6–2.7% in Aug–Sep 2026, and 4.2% in Oct 2026. Available liquidity is only about $0.6–1M. — [DefiLlama chart ddf68725](https://yields.llama.fi/chart/ddf68725-6ced-4c27-90ca-c14752cd7218)
- Incident: on 26 Apr 2026 a reward-logic flaw cost $142K. — [DefiLlama hacks API](https://api.llama.fi/hacks)
- TVL is down to $9.0M (from $19.9M on 1 May 2026). — [DefiLlama](https://api.llama.fi/protocols); [Datumlab](https://www.datumlab.xyz/resources/reports/state-of-lending-sui-may-june-2026)
- SDK: `@scallop-io/sui-scallop-sdk` v5.4.3 (2026-10-18). Receipt token is the sCoin / market coin (e.g. sUSDC) (receipt naming from prior knowledge, not re-verified). — npm registry

**Current (current.finance)**
- New lending protocol, listed on DefiLlama on 2026-03-31, with $56M TVL. It describes itself as "isolated lending markets and flash-loan-powered looping" with Lend, Multiply and Margin products and an "audited risk engine". Allez Labs is the stated risk-management partner. It runs a points programme (Seasons 1–3). — [DefiLlama](https://api.llama.fi/protocols); [Current docs](https://current-finance.gitbook.io/current); [Current llms.txt](https://current-finance.gitbook.io/current/llms.txt)
- Its USDC MainMarket pool total APY averaged 8.6% (Apr 2026), 7.6% (Jun), 9.7% (Aug) and 7.1% (Oct). **Rewards make up about two-thirds** of that (base 1.4–2.7%). — [DefiLlama chart a0860ad8](https://yields.llama.fi/chart/a0860ad8-ba2a-4ff8-8a13-348788864f23)
- Audit index: [current-finance.gitbook.io/current/security-and-risk/audit-reports](https://current-finance.gitbook.io/current/security-and-risk/audit-reports) (contents not read).
- **Ambiguity:** DefiLlama names Current's pools "MainMarket" and "EmberMarket", the same names JewelSwap uses for Suilend's markets. I could not determine whether Current is related to Suilend (e.g. a fork, or the same team) or whether one source mislabels the other. — [DefiLlama Yields](https://yields.llama.fi/pools); [JewelSwap](https://www.jewelswap.io/blog/how-to-use-suilend)

**AlphaLend (Bluefin)**
- DefiLlama shows AlphaLend at $0 TVL, and its URL now points to trade.bluefin.io/lend. Datumlab says DefiLlama **stopped covering AlphaLend on 5 Jun 2026**, while Datumlab itself still tracked $55.2M TVL on 30 Jun. The $0 is a data-coverage gap, not evidence of closure. — [DefiLlama](https://api.llama.fi/protocols); [Datumlab](https://www.datumlab.xyz/resources/reports/state-of-lending-sui-may-june-2026)
- AlphaLend borrow rates ran 9.37% → 7.21% over June 2026, the highest in the sector, which implies above-average supply rates. — [Datumlab](https://www.datumlab.xyz/resources/reports/state-of-lending-sui-may-june-2026)
- SDK: `@alphafi/alphalend-sdk` v4.1.0 (2026-08-10). — npm registry

**Bucket Protocol**
- Bucket is a CDP protocol (it mints the BUCK stablecoin), not a native-USDC supply market. Its V2 TVL is $26.9M. DefiLlama lists no USDC supply pool for Bucket. — [DefiLlama](https://api.llama.fi/protocols); [DefiLlama Yields](https://yields.llama.fi/pools)
- SDK: `@bucket-protocol/sdk` v2.3.0 (2026-08-21). — npm registry

**DeepBook Margin (Mysten)**
- Live on mainnet. A Sui blog post (published 1 May 2026, updated 22 Jul 2026) says USDC deposits in Turbos' "high-yield lending pools", built with DeepBook and Abyss, yielded **over 20% annually at launch**. That is a launch figure, not a current rate. Integrated protocols: DeepTrade, Abyss, Current, Turbos, Cetus. — [Sui blog](https://www.sui.io/blog/deepbook-spot-margin-primitives-for-builders)
- Sui docs list a USDC margin pool with a **2,000,000 USDC supply cap**, 90% max utilisation, a 20% referral spread, and a SupplierCap-based supply/withdraw flow in the SDK. These are snippet-level details; I did not fetch the full page. — [Sui docs, margin contract info](https://docs.sui.io/onchain-finance/deepbook-margin/contract-information.md); [Margin Pool SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/margin-pool.md)
- SDK: `@mysten/deepbook-v3` v2.9.1 (2026-10-30). — npm registry
- The Abyss USDC pool currently pays 7.42% base (30d mean 9.06%), on $0.17M available. — [DefiLlama Yields](https://yields.llama.fi/pools)

### Inferences
- **Realistic sustainable base for a savings product: about 4–6% APY** on native USDC from NAVI, Suilend or Scallop base interest. Anything above about 7% today is either incentives (Current) or strategy or credit risk (Ember, see §2).
- DefiLlama's lending "tvlUsd" appears to be available liquidity. For example, NAVI's USDC pool shows only $2.7M while NAVI's total TVL is $137M. That figure is a useful proxy for how much an app could withdraw instantly. By it, only Current MainMarket (about $19M) and NAVI (about $3M) have meaningful free USDC.
- Every major lender has a current TS SDK published within the last month: Suilend, NAVI, Scallop and DeepBook. All three Sui-native lenders expose deposit/withdraw as Move calls that compose in a PTB (an SDK returns a transaction builder), so they fit Enoki sponsorship. That composability is inferred from the SDKs' design and is not per-function verified here.
- Diversifying across 2–3 lenders, with per-protocol caps tied to available liquidity, mitigates the 82–94% utilisation episodes.

### Gaps
- No primary-source current Suilend USDC rate (the Suilend app is JS-rendered and DefiLlama does not track it). The 12 Oct figures come from a competitor's blog.
- Admin-key, upgrade-cap, timelock and multisig details were not verified for any protocol.
- AlphaLend's current USDC rate and TVL are unknown (DefiLlama coverage ended in June 2026).
- I found no current DeepBook Margin USDC supply APR. It would need to be read live through the `@mysten/deepbook-v3` margin SDK.
- Testnet availability: the DeepBook Margin docs include testnet contract info (snippet). I did not verify whether Suilend, NAVI or Scallop maintain usable testnet markets for native USDC. A savings feature on testnet would likely need mocks or DeepBook Margin testnet.

## 2. Aggregators, vaults and fixed-rate / fixed-term products

### Takeaway
**Ember** (Bluewater Labs / Bluefin) dominates curated USDC vaults on Sui, at about $96M protocol TVL. Its vaults advertise 7–24% APY, but those returns come from curator strategies (basis trades, RWA credit, concentrated liquidity, Polymarket), not lending. Aggregators (AlphaFi, Kai, Haedal Lending Vault) are small. Fixed-rate yield tokenisation (Nemo) is effectively dead after a 2025 exploit, so there is no credible on-chain "locked savings" product today.

### Cited Findings
- Ember USDC vaults (DefiLlama, 2026-11-02):
  - Ember Earn: 10.00% base, $11.1M TVL. Monthly averages: May 7.3%, Jun 9.0%, Aug–Oct about 10.0–10.2%. The rate is suspiciously flat at exactly 10.0%, which may be a managed or target rate.
  - Bitwise Premium+ RWA: 23.58% (30d mean 11.19%), $8.8M.
  - R25 Treasury: 8% base + 4% reward, $8.7M.
  - USD Metavault: 11.52%, $0.9M.
  - Concentrated Liquidity: 17.1%, $0.95M.
  - Basis: 7.33%, $0.3M.
  - ACRED: 4.12%, $0.02M.
  - Polymarket Vault: 13.98%, $0.02M.
  - rcUSD Vault: 8.00%.

  — [DefiLlama Yields API](https://yields.llama.fi/pools); [chart a1a9916c](https://yields.llama.fi/chart/a1a9916c-63b2-49a1-b4b0-cbe8a9e7275c)
- Ember is described as non-custodial structured vaults run by third-party curators across lending, spot AMMs and perps. The eEARN share token runs "lending, leveraged looping, and delta-neutral funding-rate" strategies. Fees are set per curator. — [Bluefin learn docs](https://learn.bluefin.io/bluefin/structured-vaults/introduction); [tradingstrategy.ai Ember Earn](https://tradingstrategy.ai/trading-view/vaults/stablecoins/eearn)
- The DefiLlama RWA page for Ember R25 Treasury (mrcUSD) flags that, **as of 2026-10-19, the vault rate marks about 5% above on-chain backing** (rcUSD implied at $1.0536 against a $1 peg). Backing is held as rcUSDp. — [DefiLlama RWA mrcUSD](https://defillama.com/rwa/asset/mrcUSD)
- SUI Group placed $10M of suiUSDe into an Ember-operated vault (Feb 2026). — [BusinessWire](https://www.businesswire.com/news/home/20260211361691/en/SUI-Group-Launches-eSUI-suiUSDe-with-Ethena-and-Advances-Institutional-Adoption-Through-the-suiUSDe-Vault-on-Ember-Protocol-and-Bluefin)
- Ember SDK: `@ember-finance/sdk` v2.38.0 (2026-10-29). Audit PDF: [ember.so/documents/ember_protocol_audit.pdf](https://ember.so/documents/ember_protocol_audit.pdf). — npm registry; [DefiLlama](https://api.llama.fi/protocols)
- Other vaults and aggregators (DefiLlama TVL on Sui, 2026-11-02): Haedal Lending Vault $6.9M (listed 2026-09-29; MoveBit audit dated 2026-09-23; deploys into other Sui lenders); Kai Finance $1M (USDC 1.92%, 30d mean 0.85%); AlphaFi Agg $1.8M; AlphaFi Lending $1.9M; Mole $4.1M; Abyss $0.3M; Nemo Vault $0.03M. — [DefiLlama](https://api.llama.fi/protocols); [Haedal audit](https://github.com/haedallsd/audit-report/blob/main/20260923-Haedal-Lending-Vault-Final-Audit-Report-MoveBit.pdf)
- Volo Vault (USDC, WBTC and XAUm vaults) lost **$3.5M on 21 Apr 2026** through a compromised vault admin private key (possibly social engineering, unconfirmed). Volo froze the vaults and absorbed the losses. Reports of the recovered amount conflict: about $0.5M frozen initially ([The Block](https://www.theblock.co/post/398393/sui-volo-protocol-exploited)) vs about $60K net loss later ([Rekt](https://alpha.rekt.news/volo-rekt)). — [Cointelegraph](https://cointelegraph.com/news/volo-defi-3-5m-exploit-vault-attack-recovery)
- Fixed rate: Nemo yield trading (Pendle-style principal/yield split) was exploited for **$2.59M on 8 Sep 2025** (improper access control) and now shows $0 TVL. — [DefiLlama hacks API](https://api.llama.fi/hacks); [DefiLlama protocols](https://api.llama.fi/protocols)

### Inferences
- Ember vault APYs are strategy and credit returns, including RWA private credit and basis trades. They carry curator and off-chain counterparty risk, which differs in kind from lending. They suit at most a clearly labelled "higher-yield" tier, not default savings.
- The Volo incident shows that admin-key risk in vaults is the live threat on Sui in 2026: three audits did not prevent a key compromise.
- A "locked savings" tier would have to be **app-level**: a time-lock wrapper over a variable-rate lender, with no on-chain fixed rate. Alternatively it could use a term vault such as Ember R25 / Bitwise, which have redemption terms (redemption terms not verified).

### Gaps
- Ember vault withdrawal/redemption windows, curator identities, and whether Sui vault shares are composable in a PTB were not verified.
- I found no live fixed-rate USDC lending product on Sui.
- I did not research Kai Finance or AlphaFi USDC vault strategy details further, because their TVL is small.

## 3. RWA / tokenized T-bills on Sui

### Takeaway
**Ondo USDY** is the only major tokenized-Treasury product with clear native Sui presence: $14.4M on Sui, 3.75% APY. Primary minting is non-US only, with KYC and a $100K minimum. I found no evidence that BENJI, BUIDL, OUSG or OpenEden TBILL run on Sui. RWA yield otherwise reaches Sui through vault wrappers: Ember R25, Ember Bitwise, Ember ACRED, and KAIO.

### Cited Findings
- USDY on Sui (DefiLlama ondo-yield-assets): $14.38M, **3.75% APY** (30d mean 3.69%), 2026-11-02. — [DefiLlama Yields API](https://yields.llama.fi/pools)
- Ondo launched USDY natively on Sui in March 2024. — [Decrypt](https://decrypt.co/219853/ondo-usdy-treasuries-token-now-available-on-sui/)
- USDY primary issuance is restricted to non-US investors with a $100K minimum. — [Eco comparison 2026](https://eco.com/support/en/articles/15254006-ousg-vs-buidl-vs-usdy-yield-2026-tokenized-t-bills-compared)
- Supplying USDY to NAVI earns 0.69% (30d mean 3.07%) and to Scallop 0.24%. The Cetus USDC-USDY pool ($2.05M) earns about 0.05%, which suggests a secondary market exists. — [DefiLlama Yields](https://yields.llama.fi/pools)
- I found no sources placing BENJI, TBILL or OUSG on Sui. — [Eco tokenized treasuries compared](https://eco.com/support/en/articles/15002232-tokenized-treasuries-compared)
- R25 (RWA vault infrastructure, listed 2026-04-29) has $196M TVL across all chains. KAIO (formerly Libre Capital) has $39M (an Apr 2026 strategic round included Tether), with about $20M on Sui per a snippet. — [DefiLlama](https://api.llama.fi/protocols); [DefiLlama KAIO](https://defillama.com/protocol/kaio)

### Inferences
- For a Lagos-first app, USDY's non-US restriction is not disqualifying in itself, but primary mint/redeem needs KYC and a $100K minimum. An app could only buy USDY on the secondary market (e.g. through Cetus), with thin liquidity and price risk, and USDY transfer restrictions may apply (not verified).

### Gaps
- USDY secondary-market depth and any transfer-restriction rules on Sui were not verified.
- KYC requirements for Ember RWA vaults (R25, Bitwise, ACRED) are unknown. ACRED (Apollo) is typically accredited-only (prior knowledge, unverified).

## 4. Yield-bearing / native stablecoins on Sui

### Takeaway
**USDsui** (issued by Bridge/Stripe, mainnet since 4 Mar 2026) does **not** pass reserve yield to holders. The yield goes to the Sui ecosystem (SUI buyback and DeFi incentives). Holders earn only by supplying it to lenders, where it currently pays about 6.1–6.9%, well incentivised. suiUSDe (Ethena) is the main synthetic yield-bearing dollar. No yield-bearing USDC variant was found on Sui.

### Cited Findings
- USDsui launched on mainnet on 4 Mar 2026, issued by Bridge (Stripe) through Open Issuance and backed by Treasuries and liquid assets. Reserve yield is directed to SUI buybacks and DeFi/AMM incentives, not to holders. One report says Galaxy manages assets, with $10M in a yield vault. — [Whale Alert](https://whale-alert.io/stories/b592014303c618/Sui-launches-native-USDsui-stablecoin-to-power-payments-and-DeFi); [CryptoBriefing](https://cryptobriefing.com/sui-stablecoin-launch-treasury-yield/?rand=59535); [Tangem](https://tangem.com/en/news/stablecoins/16859-sui-launches-usdsui-stablecoin-redirects-yield-to-ecosystem/) (secondary press; no primary Bridge or Sui release read)
- USDsui supply rates (2026-11-02): Current 3.13% base + 2.98% reward = 6.11% ($6.07M); NAVI 3.74% + 3.18% = 6.92% ($0.96M); Scallop 5.12% ($0.02M). The Bluefin USDsui-USDC LP pays 10.9%, mostly rewards. — [DefiLlama Yields](https://yields.llama.fi/pools)
- suiUSDe (Ethena, launched with SUI Group, Feb 2026) has a Bluefin pool (SUIUSDE-USDC) and is a DeepBook Margin asset. — [BusinessWire](https://www.businesswire.com/news/home/20260211361691/en/SUI-Group-Launches-eSUI-suiUSDe-with-Ethena-and-Advances-Institutional-Adoption-Through-the-suiUSDe-Vault-on-Ember-Protocol-and-Bluefin); [DefiLlama Yields](https://yields.llama.fi/pools)
- The legacy Wormhole USDC (wUSDC) is deprecated: Suilend has a deposit limit of 0, and wUSDC earns 0.38–0.99% on NAVI and Scallop. — [JewelSwap](https://www.jewelswap.io/blog/how-to-use-suilend); [DefiLlama Yields](https://yields.llama.fi/pools)

### Inferences
- USDsui's ecosystem-subsidised incentives may make "USDsui savings" briefly outyield USDC, but those incentives are discretionary. Holding USDsui also adds Bridge issuer risk and a USDC↔USDsui swap step.

### Gaps
- AUSD (Agora) status and yield on Sui were not researched (no results surfaced). sUSDe-style staked yield availability on Sui was not verified.

## 5. Historical APY volatility (2025–2026)

### Takeaway
Native USDC supply APY on Sui fell from incentive-inflated 10–30% (2023–24) to a **base-driven 4–6% band through 2026**, with brief spikes during volatility. Incentives collapsed from more than 10% to under 1% at NAVI and Scallop by 2025. Plan for a **4–5% sustainable base**, with dips to about 2.5% (Scallop, Aug–Sep 2026) and spikes into double digits during leverage demand.

### Cited Findings
- NAVI USDC monthly average total APY (base / reward):
  - 2024-03: 29.9% (5.6 / 24.4)
  - 2024-12: 16.6% (12.3 / 4.2)
  - 2025-03: 4.4% (4.4 / 0)
  - 2025-09: 12.0%
  - 2025-11: 12.9%, with a daily max of 88%
  - 2025-12: 5.0%
  - 2026-01 to 2026-10: between 4.7% and 5.9% every month

  — [DefiLlama chart 0fddbf5d](https://yields.llama.fi/chart/0fddbf5d-ec14-4570-80d3-a70c85573d3e)
- Scallop USDC base monthly averages: 16.8% (Dec 2024), 1.8% (Apr 2025), 10.6% (Sep 2025), 5.2–5.7% (Jan–Jun 2026), 2.6% (Aug 2026), 4.2% (Oct 2026). Daily max in Oct 2025 was 74.8%. — [DefiLlama chart ddf68725](https://yields.llama.fi/chart/ddf68725-6ced-4c27-90ca-c14752cd7218)
- Current USDC MainMarket total APY ranged 7.1–9.7% monthly from Apr to Oct 2026; base was 1.4–2.7%. — [DefiLlama chart a0860ad8](https://yields.llama.fi/chart/a0860ad8-ba2a-4ff8-8a13-348788864f23)
- Sector borrow rates fell in June 2026 (Suilend 6.01% → 4.46%), tracking the TVL decline. — [Datumlab](https://www.datumlab.xyz/resources/reports/state-of-lending-sui-may-june-2026)

### Inferences
- Within-month daily ranges are wide (e.g. NAVI Apr 2026: 2.9–22.2%). A consumer UI should show a trailing 7-day or 30-day average, not the spot rate.

### Gaps
- I have no Suilend historical USDC series (not on DefiLlama Yields).

## 6. Incidents and insurance

### Takeaway
The Cetus exploit (22 May 2025, about $223M) is the defining Sui incident. It was largely recovered through a validator freeze and a governance vote, which shows both a safety net and a centralisation trade-off. Lending-protocol incidents since then are small. Vault and admin-key failures (Volo) and oracle errors are the active risk. **I found no credible on-chain insurance option for Sui USDC deposits.**

### Cited Findings
- Cetus: an arithmetic or overflow bug in the CLMM drained about $223M on 22 May 2025. Validators froze about $162M; about $60M was bridged to Ethereum. A governance vote with about 90% approval moved frozen funds to a multisig held by Cetus, OtterSec and the Sui Foundation. Cetus relaunched about 17 days later, using recovered funds, its $7M reserves and a $30M USDC loan from the Sui Foundation. The Foundation also committed $10M to security initiatives. — [The Block, vote](https://www.theblock.co/post/356347/sui-community-passes-governance-vote-to-recover-stolen-cetus-funds-blocked-by-validators-in-223m-heist); [The Block, relaunch](https://www.theblock.co/post/357386/sui-dex-cetus-protocol-restarts-platform-after-recovering-from-223-million-exploit); [Cointelegraph](https://cointelegraph.com/news/sui-validators-freeze-majority-stolen-funds-220m-cetus-hack)
- Other Sui incidents per DefiLlama:
  - Nemo, 2025-09-08: $2.59M, access control
  - Typus Perp, 2025-10-15: $3.44M, oracle
  - Volo Vault, 2026-04-21: $3.5M, key compromise
  - Scallop Lend, 2026-04-26: $142K, reward logic
  - Aftermath Perps, 2026-04-29: $1.14M, withdrawal logic
  - BlueMove, 2026-07-11: $529K
  - Full Sail, 2026-08-29: oracle, amount not given

  No incidents are listed for NAVI, Suilend or Current. — [DefiLlama hacks API](https://api.llama.fi/hacks)
- The JewelSwap guide says Suilend had 2025 losses in isolated pools; this is unspecified and not reflected in DefiLlama's hack list. — [JewelSwap](https://www.jewelswap.io/blog/how-to-use-suilend)

### Inferences
- The validator freeze is not a guarantee: it required validator coordination and a governance vote, and it would not cover slow insolvency or bad debt.

### Gaps
- Insurance: I did not search exhaustively. I found no Sui-native or cross-chain cover (e.g. Nexus Mutual, OpenCover) for Suilend, NAVI or Scallop. This needs a dedicated check.
- Unrelated to yield but relevant to integration: npm shows `@mysten/sui` at 2.38.0 (2026-10-26), while the repo's CLAUDE.md locks 2.19.0. Protocol SDKs may require a newer peer version.
