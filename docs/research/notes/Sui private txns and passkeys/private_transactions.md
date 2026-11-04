# Private / Confidential Transactions on Sui (state as of 2026-11-02)

Status legend: **LIVE-MAINNET** / **TESTNET** / **DEVNET** / **ANNOUNCED** / **HACKATHON/UNVERIFIED**.
Research window: searches run 2026-11-02. Most recent primary source found on native confidential transfers is the Sui blog post dated 2026-06-08 (last modified 2026-07-22). No primary source found showing a testnet or mainnet launch after that.

## 1. Native confidential transfers / private transactions on Sui

### Takeaway
Sui's native privacy feature is **"Confidential Transfers"**, and the latest confirmed status is **public beta on DEVNET only** (since 2026-06-08). It is unaudited and not production-ready. A testnet launch is "targeted later in 2026", but I found no confirmation it has happened. There is no mainnet date. The design hides **balances and amounts only**. Sender and receiver addresses stay public. It is issuer opt-in per token, and an issuer-set auditor key can decrypt each transfer amount. Mysten's separate public promise of "private-by-default stablecoin transfers in 2026" is still roadmap.

### Cited Findings
- **Announcement history (ANNOUNCED):**
  - Dec 2025: Mysten co-founder/CPO Adeniyi Abiodun said "private transactions" would come to Sui in 2026 and framed privacy as a prerequisite for mainstream payments. Reported as privacy by default with selective disclosure. — [Bitcoinist](https://bitcoinist.com/sui-plans-private-transactions-for-2026/amp/)
  - 2026-05-07 (Consensus 2026): Abiodun said zero-fee stablecoin transfers and private payments are slated for "sometime in 2026", with no month given and not live. Quote: users shouldn't accept "bank accounts look like Twitter". He also said Sui had processed >$1T stablecoin volume since August. — [The Block](https://theblock.co/post/400396/mysten-labs-abiodun-says-sui-processed-over-1-trillion-in-stablecoin-volume-since-august-as-it-eyes-free-private-payments)
  - ~2026-05-22: secondary outlets reported Abiodun announced protocol-level private transactions for mainnet, focused on making stablecoin transfers confidential by default. Only sender and recipient would see amounts, and issuers/regulators could be granted visibility. — [Bitcoin.com News](https://news.bitcoin.com/sui-to-make-all-stablecoin-transactions-private-by-default-in-massive-update/), [KuCoin flash](https://www.kucoin.com/news/flash/sui-mainnet-to-introduce-native-private-transactions-token-surges-20). (Secondary or aggregator only. Some aggregators, e.g. Pluang and Guavy, wrongly describe it as already live on mainnet.)
- **Devnet public beta (DEVNET), official:** "Confidential Transfers on Sui: Now in Public Beta". Published 2026-06-08 by Sui Foundation, last modified 2026-07-22.
  - Balances and transfer amounts are hidden. Sender and receiver identities stay visible.
  - Issuers opt in by enabling "confidential mode" for their own tokens and define who can access sensitive data.
  - Testnet is "targeted for later in 2026". No mainnet timeline.
  - Collaborators: Bridge (stablecoin issuer/payments), TRM Labs and Merkle Science (risk scoring/monitoring). A prototype wallet is linked from the repo.
  - Source: [Sui blog](https://www.sui.io/blog/confidential-transfers-public-beta)
- **Press framing:** Crypto Briefing (2026-06-12) calls the model "deliberately partial" (unlike Monero/Zcash) and describes disclosure as sender-controlled for auditors and regulators. It says the feature is unaudited and "explicitly not production-ready". — [Crypto Briefing](https://cryptobriefing.com/sui-network-confidential-transfers-devnet-beta/)
- **Technical design (official repo):**
  - Repo: MystenLabs/confidential-transfers. Twisted ElGamal over Ristretto255 plus ZK proofs. Amounts are split into four u16 limbs, decrypted with baby-step giant-step, and additively homomorphic.
  - Move modules: `contra.move` (entry point) and `twisted_elgamal.move`. It is a standalone Move package, not yet in the framework.
  - TS SDK: `ContraClient` for user flows and `ContraAuditor`, which decrypts amounts from `TransferEvent`s.
  - Flows: **wrap** (public `Coin<T>` into `Pool<T>`, amount visible), **confidential transfer** (amount encrypted, credited to the receiver's *pending* balance; the receiver calls `merge`), and **unwrap** (amount visible).
  - Auditor key: one per token, set by the issuer via `update_auditors`. The sender attaches an auditor-readable copy of each amount. Auditors don't see viewing keys or standing balances.
  - README warnings: "has not been audited and should not be used in production" and "Cryptography is not finalized". The SDK is not wallet-ready, and the demo app (Kaisho) stores secrets in localStorage.
  - Repo stats seen: 51 commits, 9 open PRs, 22 stars.
  - Source: [GitHub repo](https://github.com/MystenLabs/confidential-transfers)
- **Range proofs:** Range proofs use Bulletproofs via the framework module `sui::rangeproofs` (`verify_bulletproofs_ristretto255`). — [docs.sui.io rangeproofs](https://docs.sui.io/references/framework/sui_sui/rangeproofs). A third-party review filed as a GitHub issue flags a medium issue (range-proof bytes reusable across contexts) and says amount conservation is unaffected. — [Issue #8](https://github.com/MystenLabs/confidential-transfers/issues/8)
- **Sui Foundation interview (2026-08-07):** Mysten's Abhinav Garg and TRM's Liam Glennon. Stablecoin issuers would hold view/audit keys, TRM would request access when appropriate, possibly using TEEs, with risk-based defaults. Still described as "public beta". No mainnet date. — [Sui blog](https://www.sui.io/blog/why-privacy-is-the-next-phase-of-blockchain-adoption)
- **No later confirmation:** I searched for an October 2026 testnet launch and found none. Latest coverage is still the June devnet beta. — [cryptorank](https://cryptorank.io/news/feed/669a5-sui-confidential-transfers-devnet-beta), [crypto.news](https://crypto.news/sui-launches-privacy-feature-that-keeps-regulators-in-the-loop/)

### Inferences
- For ReeF, native confidential tips are **not usable in production today**. Devnet resets regularly and the crypto is not finalized. At the earliest, ReeF could prototype against devnet, or testnet if it lands.
- Even when live, confidential transfers **won't hide who tipped whom**. The social graph of tips stays public. Only amounts are hidden.
- The issuer opt-in and auditor key mean privacy for USDC tips depends on Circle (or USDsui/Bridge) enabling confidential mode. ReeF can't turn it on for a token it doesn't issue. ReeF could, however, issue its own creator coins in confidential mode.
- Wrap and unwrap amounts are public. Users moving from a public balance into a confidential balance leak amounts at the boundary.
- Gas sponsorship (Enoki) of confidential-transfer PTBs isn't addressed anywhere. Transactions are large and assembled piece by piece, so sponsor costs could be higher.

### Gaps
- No confirmation of testnet availability as of Nov 2026. I didn't check the repo's commit dates, so I can't confirm current activity level.
- Gas cost per confidential transfer is unknown.
- Whether "default privacy for stablecoins" (May 2026 claim) is the same project as Confidential Transfers, or a further protocol-level step, isn't stated in primary sources. Treat them as the same lineage, unverified.
- No SIP number found for confidential transfers.

## 2. Third-party privacy protocols on Sui (pools, shielded pools, mixers, stealth addresses)

### Takeaway
There is **no audited, production-grade shielded pool or mixer on Sui** that I could verify. What exists is hackathon or prototype work (Octopus, identiPay's shielded pool) and an announced-but-unshipped Iron Fish port (SuiFish). I found no TVL data for any of them. I found no Sui stealth-address protocol.

### Cited Findings
- **Octopus** (HackMoney 2026, ETHGlobal showcase): a Tornado/Zcash-inspired UTXO shielded pool.
  - Poseidon note commitments and nullifiers, a 16-level Merkle tree (65,536 notes), Groth16 over BN254, and shield/unshield/private transfer.
  - The page says it is deployed on Mainnet and Testnet (sui-octopus.vercel.app). No contract addresses or audit.
  - Swaps in progress. Relayer and Private Proofs of Innocence are planned.
  - Source: [ETHGlobal showcase](https://ethglobal.com/showcase/octopus-xu3qf). **HACKATHON/UNVERIFIED.**
- **SuiFish (Iron Fish v2 on Sui):** blog post dated 2025-10-30. Planned shield/unshield, private transfers, and private swaps/lending, plus opt-in view keys. No launch, testnet, timeline, or audit stated. — [Iron Fish blog](https://ironfish.network/learn/blog/2025-10-30-suifish). **ANNOUNCED.** A follow-up search found no 2026 launch coverage.
- **identiPay:** developer docs describe a Sui shielded-pool contract. It is a project or example, not protocol. — [identiPay docs](https://www.mintlify.com/krsultov/identiPay/protocol/shielded-pool). **UNVERIFIED.**
- **Stealth addresses:** no Sui-specific stealth-address protocol found. Reference designs exist elsewhere: ERC-5564/Umbra (Ethereum), and [BaseSAP](https://arxiv.org/pdf/2306.14272) (generic). Stealth addresses alone leave flows traceable at pseudonymous endpoints (BaseSAP paper).
- **Survey:** 4Pillars research on built-in privacy on general-purpose chains covers Sui alongside others. — [4Pillars](https://research.4pillars.io/en/research/a-look-at-built-in-privacy-on-general-purpose-chains)

### Inferences
- Building ReeF's private tips on Octopus or similar would mean depending on unaudited hackathon code. Writing its own pool would carry Tornado-style regulatory exposure (section 7).
- A stealth-address scheme is feasible on Sui with existing primitives (secp256k1/ed25519/ristretto in Move, off-chain scanning), but it would be novel, unaudited work. It would also clash with Enoki/zkLogin addresses: each stealth address needs its own gas, though Enoki sponsorship could mitigate that.

### Gaps
- TVL for any Sui privacy pool: none found.
- Audit reports: none found.

## 3. zkLogin privacy properties

### Takeaway
zkLogin gives **identity-to-address unlinkability on-chain**, provided the salt stays secret. It gives **no transaction privacy**: the address is stable and all its activity is linkable. It also leaks which OAuth provider and app were used. The salt and proving services can link the Google identity to the address.

### Cited Findings
- The address derives from `iss`, `aud`, `sub` and `user_salt`. By default nothing on-chain links the OAuth `sub` to the address, and the salt prevents recovery. — [zkLogin docs](https://docs.sui.io/sui-stack/zklogin-integration/zklogin)
- `iss`, `aud` and `kid` are revealed on-chain, so the provider and the app's client ID are public. `sub`, the JWT and the salt are private inputs. — same
- A leaked salt doesn't enable theft but links `sub` to the address. The risk is higher for providers with public, reusable `sub` values (Google, Twitch) than for pairwise ones (Facebook). Losing the salt means losing the address. — same
- The proving service and salt service see the JWT and salt and can link identity. The docs say they are stateless by design. — same
- The address is stable across sessions, so all activity is linkable to one account. — same

### Inferences
- With Enoki managing salts, Mysten/Enoki (and ReeF, as the Enoki app owner) can technically map a Google account to an address. That is not privacy from the operator.
- Because `aud` is public, every ReeF user's zkLogin transactions can be identified as coming from the ReeF app, which marks them out as ReeF users.

### Gaps
- Enoki's specific salt-retention and data policy wasn't fetched.

## 4. Seal: what it does and does not hide

### Takeaway
Seal is **threshold, identity-based encryption with Move-defined access policies** for *data* (blobs and messages). It doesn't make transactions, amounts, or senders private. Mysten's own docs say it is "not a privacy-preserving technology like zkLogin".

### Cited Findings
- Decentralized secrets management. Data is encrypted client-side and stored on Walrus or elsewhere. Key servers release decryption keys only when the app's Move policy on Sui allows it. Encryption is t-of-n threshold across independent key servers. — [Seal docs](https://docs.sui.io/sui-stack/seal)
- Decentralized MPC "committee mode" is currently testnet only. Independent-server mode is the main mode. — same
- Listed use cases include private personal data, allowlists, subscriber-gated content, E2E messaging, voting, and "MEV-resilient trading in Move". — same
- Non-goals: not a KMS, "not a privacy-preserving technology like zkLogin", and not for wallet keys, PHI, or government secrets. — same
- Seal whitepaper released 2026-01-08 (per BlockEden; secondary). BlockEden also claims 3-of-5 testnet key servers and integrations with OneFootball and Alkimi. — [BlockEden](https://blockeden.xyz/blog/2026/03/12/sui-protocol-level-private-transactions-default-privacy/) (promotional; unverified)

### Inferences
- Seal fits ReeF for **private tip messages and notes, gated content, and encrypted order intents**. Policy-check transactions and access-control objects are on-chain and public, so metadata leaks: who is on an allowlist and who paid for access.
- A "sealed-bid" or commit-reveal pattern with Seal can hide trade intent until reveal, but settlement is public.

### Gaps
- I didn't confirm Seal's mainnet launch date in this session. My training knowledge says Seal mainnet launched in 2025; verify separately.

## 5. Nautilus (TEE) for private matching or payments

### Takeaway
Nautilus is Sui's verifiable off-chain compute framework (AWS Nitro Enclaves, with attestation verified in Move). It *can* host private order matching, and the docs list DEXs as a use case. But I found **no live private or dark-pool venue using it**. Bluefin's Nautilus matching engine publishes all inputs to Walrus, so it is verifiable rather than private. The "shell" repo is a prototype of Seal plus Nautilus encrypted matching.

### Cited Findings
- Nautilus is a framework for verifiable off-chain computation. The initial release targets AWS Nitro Enclaves. There is no native TEE network. DEX order matching and settlement are a listed use case. — [Sui docs (Nautilus)](https://sui-docs-a1wimxxy4-sui-foundation.vercel.app/concepts/cryptography/nautilus) (a docs preview mirror)
- **Bluefin:**
  - Signed orders go to a Nautilus enclave, and matching takes less than 1 ms.
  - Inputs, outputs and attestations are published to Walrus. Orderbook checkpoints are published every few seconds, and anyone can reproduce the computation.
  - Only matches hit on-chain balances. Page updated 2025-09-22.
  - So order flow is publicly reproducible, not private.
  - Source: [Bluefin docs](https://bluefin-exchange.readme.io/reference/how-does-it-work)
- **"shell" (GitHub, furqaannabi/shell):** matching engine in a Nitro Enclave. Order details are encrypted, and the chain sees only ciphertext plus a commit hash before the match. The enclave gets keys via Seal. Self-described design mockups and a Move package. — [GitHub](https://github.com/furqaannabi/shell). **PROTOTYPE/UNVERIFIED.**
- TRM suggested TEEs as a way for compliance analytics to handle confidential data. — [Sui blog interview](https://www.sui.io/blog/why-privacy-is-the-next-phase-of-blockchain-adoption)

### Inferences
- ReeF could run a Nautilus enclave as a private tip aggregator or batcher. Users deposit to a pool, the enclave keeps internal balances and batches payouts, and the on-chain graph only shows pool to creator. Privacy would then rest on trusting the TEE (AWS Nitro plus ReeF's code), not on cryptography. Deposits and payouts stay public.

### Gaps
- No official Mysten or DeepBook statement on TEE-based dark pools found.

## 6. DeepBook privacy (dark pools, hidden orders)

### Takeaway
**Nothing live or officially planned found.** DeepBook v3 matching is fully on-chain and public: taker orders match against resting makers in the same transaction.

### Cited Findings
- DeepBook matches on-chain and autonomously, with no operator or crank. — [DeepBook design docs](https://docs.sui.io/deepbook-design), [DeepBook orders](https://docs.sui.io/deepbook-orders)
- No source connects Nautilus or Confidential Transfers to DeepBook. — search results summarised above (negative finding)

### Inferences
- Any "private trading" for ReeF on DeepBook would have to be app-layer: a TEE or batch auction that settles on DeepBook in aggregate, or Seal-encrypted intents. Settlement trades stay public.

### Gaps
- DeepBook roadmap for hidden or iceberg orders: no source found.

## 7. Move ZK and crypto primitives available

### Takeaway
Sui Move already has what a shielded pool or confidential token needs:
- Groth16 verification over BN254 and BLS12-381
- Ristretto255 group ops and Bulletproofs range-proof verification (`sui::rangeproofs`)
- generic `group_ops`
- BLS12-381
- ECVRF
- many hashes and signature schemes

Poseidon was not confirmed in this session's sources.

### Cited Findings
- Groth16 verifies any NP statement on BN254 or BLS12-381 and enables privacy-preserving apps. — [Groth16 guide](https://docs.sui.io/guides/developer/cryptography/groth16), [Cryptography overview](https://docs.sui.io/develop/cryptography/)
- Signatures: Ed25519, ECDSA secp256k1/r1, and BLS G1/G2 (verifiable in Move). Hashes: SHA2-256, SHA3-256, Keccak-256, Blake2b-256. ECVRF over Ristretto. — [Cryptography overview](https://docs.sui.io/develop/cryptography/)
- `sui::rangeproofs::verify_bulletproofs_ristretto255` takes proof bytes, bit count, Ristretto commitments and version, and depends on `sui::group_ops` and `sui::ristretto255`. — [rangeproofs reference](https://docs.sui.io/references/framework/sui_sui/rangeproofs)
- The SP1 zkVM Groth16 verifier for Sui (SoundnessLabs) lets general Rust programs be proven and then verified in Move. — [GitHub sp1-sui](https://github.com/SoundnessLabs/sp1-sui)
- Octopus uses Poseidon commitments with Groth16/BN254 on Sui, which implies Poseidon is usable, either inside the circuit or via the `sui::poseidon` module. — [ETHGlobal](https://ethglobal.com/showcase/octopus-xu3qf) (indirect)

### Inferences
- Primitives aren't the blocker. Audited circuits and contracts, an anonymity-set size big enough to matter, and regulatory posture are.

### Gaps
- `sui::poseidon` (bn254) existence and mainnet availability not confirmed via a fetched source this session. Training knowledge says it exists in the framework; verify.
- Nitro attestation verification module (`sui::nitro_attestation`) not confirmed this session.

## 8. Regulatory posture and compliance designs

### Takeaway
Sui's official direction is **compliance-first, partial privacy**: amounts hidden, parties visible, issuer opt-in, auditor keys, and collaboration with TRM and Merkle Science. That is a deliberate contrast with Tornado-style full anonymity. The Tornado Cash developer case is still unresolved in late 2026, so full mixers stay legally risky for app builders.

### Cited Findings
- Sui's confidential transfers keep senders and receivers visible and give issuers policy control over who can access confidential data and when. Access is scoped, authorized and auditable, with no automatic app-layer access. — [Sui blog](https://www.sui.io/blog/confidential-transfers-public-beta)
- TRM's view: issuers act as guardians of view and audit keys, with risk-based defaults. Velocity limits on bridges into shielded pools were cited as an example control. Sui implementing this is not confirmed. — [Sui blog interview](https://www.sui.io/blog/why-privacy-is-the-next-phase-of-blockchain-adoption)
- **Tornado Cash:**
  - US Treasury sanctioned it in 2022 (Crypto Briefing context).
  - Roman Storm was convicted in Aug 2025 of conspiracy to operate an unlicensed money-transmitting business. The jury deadlocked on the money-laundering and sanctions counts. — [FXStreet](https://www.fxstreet.com/amp/cryptocurrencies/news/tornado-cashs-roman-storm-convicted-of-running-unlicensed-money-transmitter-202508070113)
  - DOJ sought a retrial (Mar 2026). — [Daily Hodl](https://dailyhodl.com/2026/03/11/us-government-seeking-to-retry-tornado-cash-developer-roman-storm-on-money-laundering-and-sanctions-violation-charges/amp/)
  - The retrial was postponed from 2026-10-26 to 2027-04-26 while a Rule 29 acquittal motion is pending. — [LCX](https://lcx.com/en/cryptonews/tornado-cash-developer-roman-storms-retrial-delayed-to-april-2027)
  - Tornado sanctions were reportedly lifted in 2025 after a court ruling. Per my training knowledge, Treasury delisted it in March 2025 after the 5th Circuit's Van Loon ruling; verify the exact date. — [atlas21](https://atlas21.com/tornado-cash-new-trial-for-co-founder-storm-set-for-2026/)
- **Compliance designs available:**
  - Auditor keys per token (Confidential Transfers `update_auditors`). — [GitHub](https://github.com/MystenLabs/confidential-transfers)
  - Opt-in view keys (SuiFish). — [Iron Fish](https://ironfish.network/learn/blog/2025-10-30-suifish)
  - Planned Private Proofs of Innocence, an association-set style approach (Octopus). — [ETHGlobal](https://ethglobal.com/showcase/octopus-xu3qf)

### Inferences
- For a Lagos-first consumer app, the path of least legal risk is: amount-hiding via the native confidential token (once live), plus Seal-encrypted memos, plus no in-house mixer. Nigeria-specific rules (SEC Nigeria, CBN) on privacy coins weren't researched.

### Gaps
- No explicit Mysten or Sui Foundation statement on mixers or Tornado specifically.
- Nigerian or EU (MiCA, AMLR anonymous-account ban 2027) applicability was not researched in this pass.
