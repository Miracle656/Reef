# Integration path: passkey signing + private payments for ReeF (Sui, late 2026)

Scope note: grounded in the ReeF source (read-only) plus web sources gathered 2026-11-02. The local repo has no installed `node_modules/@mysten/sui`, so SDK internals were read from the published 2.19.0 source on unpkg. Claims marked **[UNVERIFIED]** could not be confirmed against a primary source in this pass.

App facts that drive every recommendation below (from the code):
- Web signing goes straight to the Enoki wallet's `sui:signTransaction` feature, found by `wallets.find(isEnokiWallet)`. It never uses dapp-kit's "current wallet". The sender is always `enokiAccount.address`. See `apps/web/lib/gasless.ts` (`useGasless`, `useEnokiSignPersonalMessage`).
- Web wallets are registered with `registerEnokiWallets(...)` inside `<WalletProvider autoConnect>` from `@mysten/dapp-kit` 1.1.1 (legacy hooks API). See `apps/web/app/providers.tsx`.
- The sponsor endpoint `services/indexer/src/sponsor.ts` calls Enoki `createSponsoredTransaction` with `{ network, transactionKindBytes, sender, allowedMoveCallTargets }` and **no zkLogin JWT**. It then calls `executeSponsoredTransaction({ digest, signature })`. The allowlist is ReeF + DeepBook Predict + messaging targets.
- Mobile uses `EnokiFlow` (`apps/mobile/lib/enoki.ts`) with a passthrough encryption shim, because Hermes has no `crypto.subtle`. `apps/mobile/lib/crypto-polyfill.ts` polyfills `getRandomValues` and `randomUUID` from `expo-crypto`, plus AES-GCM via `@noble/ciphers`. The comments say this is deliberate so things run in **Expo Go** ("no custom dev build needed"). The mobile bundle id / package is `app.umbra.mobile` and the scheme is `umbra` (`apps/mobile/app.json`).

## 1. Passkeys in React Native / Expo (libraries, domain requirements, Hermes)

### Takeaway
Passkeys on mobile need a native module, which means leaving Expo Go for a dev client / EAS build. You also need a real domain you control that serves `apple-app-site-association` and `assetlinks.json`. The Sui-side crypto (`PasskeyKeypair`) is pure-JS @noble code and should run on Hermes with the existing `getRandomValues` polyfill. The real work is writing a custom `PasskeyProvider` adapter that converts the RN library's JSON output into the `RegistrationCredential` / `AuthenticationCredential` shape the SDK expects.

### Cited Findings
- Two similarly named libraries exist. `react-native-passkey` (singular; the getclave/sharekey/mTRx0 lineage, v3.x) supports iOS 15+ and Android API 28+. `react-native-passkeys` (plural, Peter Ferguson) is an Expo module, v0.4.x, and dropped support below Expo SDK 53 — [getclave/react-native-passkey](https://github.com/getclave/react-native-passkey); [sharekey/react-native-passkey](https://github.com/sharekey/react-native-passkey); [react-native-passkeys CHANGELOG](https://unpkg.com/react-native-passkeys@0.4.1/CHANGELOG.md)
- `react-native-passkeys`: iOS needs deployment target ≥15.0 (via `expo-build-properties`). Android goes through Credential Manager and needs `compileSdkVersion` ≥34. Install is `npx expo install react-native-passkeys`, then you run `expo prebuild` / `expo run:*`, i.e. native builds. The API "aims to stay close to `navigator.credentials`" and converts base64url to buffers — [peterferguson/react-native-passkeys](https://github.com/peterferguson/react-native-passkeys)
- iOS setup: host `https://<domain>/.well-known/apple-app-site-association` (no `.json` extension) with `webcredentials.apps: ["<TeamID>.<bundleID>"]`, and add `webcredentials:<domain>` to `expo.ios.associatedDomains` — [react-native-passkeys README](https://github.com/peterferguson/react-native-passkeys)
- Android setup: host `https://<domain>/.well-known/assetlinks.json` with `package_name` and `sha256_cert_fingerprints` and the relations `handle_all_urls` and `get_login_creds`. `get_login_creds` is "required for passkey flows via Android's Credential Manager". Android caches the file for up to 24h, so reinstall after changing it. Both files need valid TLS — [react-native-passkeys README](https://github.com/peterferguson/react-native-passkeys)
- PRF / largeBlob support conflicts between forks. The mTRx0 README says PRF works on Android and iOS 18+ from v3.3, and salts are base64url-normalized to avoid Android's "No create options available" error. The sharekey README says largeBlob works on both platforms from v3.0. The getclave README says largeBlob is iOS-only and PRF is Android-only — [sharekey](https://github.com/sharekey/react-native-passkey); [getclave](https://github.com/getclave/react-native-passkey); [unpkg README 3.4.0](https://unpkg.com/react-native-passkey@3.4.0/README.md)
- `vercel.app` is on the **Public Suffix List** (private section, submitted by Vercel). So is `vercel.dev`. WebAuthn RP IDs cannot be a public suffix, so the RP ID would have to be the full `reef-xxx.vercel.app` host. It could never be shared across sibling subdomains — [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat) (checked by direct download, lines ~16325-16333)
- `@mysten/sui` 2.19.0 `PasskeyKeypair` imports only `@noble/curves/nist.js` (p256), `@noble/hashes` (blake2b, sha256, randomBytes) and `@mysten/bcs`. It does **not** use `crypto.subtle`. It parses the DER signature with `p256.Signature.fromBytes(..,'der')`, normalizes low-S, and emits compact form. `BrowserPasskeyProvider` is the only part that touches `navigator.credentials` — [unpkg @mysten/sui@2.19.0 src/keypairs/passkey/keypair.ts](https://unpkg.com/@mysten/sui@2.19.0/src/keypairs/passkey/keypair.ts)
- The SDK's provider interface is `create(): Promise<RegistrationCredential>` and `get(challenge: Uint8Array, credentialId?: Uint8Array): Promise<AuthenticationCredential>`. `getPasskeyInstance` reads the public key by calling `credential.response.getPublicKey()` (DER SPKI) and stores `rawId` as the credential id. The browser provider hardcodes `pubKeyCredParams: [{ alg: -7 }]` (ES256), `residentKey: 'required'` and `userVerification: 'required'`. The default `authenticatorAttachment` is `'cross-platform'`, but it can be overridden — [same source](https://unpkg.com/@mysten/sui@2.19.0/src/keypairs/passkey/keypair.ts)
- The device returns the public key only at creation, so the app must cache it. Recovery is done with `PasskeyKeypair.signAndRecover`: sign two messages, take the intersection of the candidate keys. Creating a new passkey produces a new address. Use one passkey per origin — [Mysten SDK passkey docs](https://sdk.mystenlabs.com/typescript/cryptography/passkey)

### Inferences
- **Expo Go is incompatible.** ReeF currently optimizes for Expo Go (per the polyfill comments), and both RN passkey libraries are native modules. Adopting passkeys forces a switch to `expo-dev-client` + EAS builds for every developer and tester. This is the single biggest workflow cost on mobile.
- **A custom domain is effectively mandatory.** The RP ID is permanent: change it and every user's passkey (and therefore their passkey-derived Sui address) is orphaned. Binding identity to `something.vercel.app` ties user funds to a Vercel project name. Buy a domain (e.g. `reef.app` or similar), set RP ID = apex, and serve both `.well-known` files from the Next.js app. Vercel can serve static files at `public/.well-known/...`; the AASA file needs `Content-Type: application/json`, set via `next.config` headers. That way web (origin `https://reef.<tld>`) and native apps share one RP ID, and a passkey created on the web works in the app and vice versa.
- **Adapter for RN.** Write `class RNPasskeyProvider implements PasskeyProvider`:
  - `create()` calls the library with ES256, `rp.id = <apex>` and `residentKey required`. It wraps the JSON result in an object whose `response.getPublicKey()` returns DER SPKI bytes, and `rawId` as an ArrayBuffer.
  - `get()` passes the challenge as base64url and returns `{ rawId, response: { authenticatorData, clientDataJSON, signature } }` as ArrayBuffers.
  - Risk **[UNVERIFIED]**: Android Credential Manager returns the WebAuthn L3 JSON `response.publicKey` (SPKI) on registration, but iOS `ASAuthorization` may expose only `attestationObject`. In that case you must CBOR-decode the COSE key and re-encode it as SPKI, which needs a small CBOR dependency. Test both platforms before committing.
- **Hermes.** `PasskeyKeypair` signing and verification is pure-JS noble, so Hermes is fine given the existing `getRandomValues` polyfill. Expect p256 verify/recover to be slower on low-end Android devices common in Lagos (plausibly tens of ms) **[UNVERIFIED, no benchmark found]**. That is irrelevant for signing, which happens on the authenticator; only `signAndRecover` does curve math on the JS side.
- Use `authenticatorAttachment: 'platform'` for mainstream users, because `'cross-platform'` (the SDK default) can push users toward a hardware key / QR flow. Rely on Google Password Manager / iCloud Keychain sync for durability.

### Gaps
- Exact current versions and late-2026 changelogs of both RN libraries; whether either ships an Expo config plugin that writes `associatedDomains` automatically.
- Whether either library returns `publicKey` SPKI on iOS registration.
- Nigeria market share of Android versions with Credential Manager passkey support (Android 9+ via Play Services; passkey sync needs Google Password Manager). No data found.
- Low-end-device performance numbers for @noble p256 on Hermes.

## 2. Plugging a passkey signer into dapp-kit 1.x / wallet-standard on web, alongside Enoki

### Takeaway
The cleanest path in ReeF is not to make the passkey a dapp-kit "wallet" for UI purposes at all. Mirror the existing pattern: `useGasless` already calls a signer directly by sender. Add a `PasskeyKeypair`-backed signer and pick the signer by the account in use. If you want it to show in dapp-kit's connect UI, register a wallet-standard wallet exactly as `registerEnokiWallets` does.

### Cited Findings
- Wallet Standard: a class implements `Wallet` and is passed to `registerWallet` for discovery. Implement both current and legacy signing features for compatibility — [Sui docs: Wallet Standard](https://docs.sui.io/onchain-finance/asset-custody/wallets/wallet-standard.md)
- The new dApp Kit (v2 / `@mysten/dapp-kit-core`) uses a `walletInitializers` option on `createDAppKit` for custom wallets outside the Wallet Standard. ReeF is on the legacy `@mysten/dapp-kit` 1.1.1 hooks API, which discovers wallets registered through wallet-standard — [dApp Kit instance docs](https://sdk.mystenlabs.com/dapp-kit/dapp-kit-instance)
- Community reference implementation: zktx-io "Sui Passkey kit" provides a React Provider for passkey wallets in dApps. It warns that the public key is only retrievable at creation — [zktx-io/sui-passkey-kit-monorepo](https://github.com/zktx-io/sui-passkey-kit-monorepo)
- Code fact: `apps/web/app/providers.tsx` calls `registerEnokiWallets` in an effect and gets back `unregister`; `apps/web/lib/gasless.ts` deliberately bypasses the "current wallet" (repo source, read-only).

### Inferences
- Recommended shape for the web:
  1. `lib/passkey.ts` holds a singleton `PasskeyKeypair`. Its compressed public key and credential id are cached in localStorage and mirrored server-side, keyed by the Enoki address, so recovery doesn't depend on browser storage.
  2. Generalize `useGasless(tx, { as: 'zklogin' | 'passkey' | 'multisig' })`. The `sign` callback becomes `keypair.signTransaction(sponsoredBytes)` for passkey, or a `MultiSigSigner` combination for multisig.
  3. Optionally wrap the keypair in a wallet-standard `Wallet` with features `sui:signTransaction` and `sui:signPersonalMessage` and call `getWallets().register(...)`, so the account appears in `useWallets()`. Note that `useWallets().find(isEnokiWallet)` keeps working because it filters by type.
- **Off-chain reaction signatures** (`useEnokiSignPersonalMessage`, verified by the indexer via `@mysten/sui/verify`): `verifyPersonalMessageSignature` dispatches on the signature scheme flag, so passkey signatures should verify unchanged **[UNVERIFIED that the indexer's verify path doesn't hardcode zkLogin]**. Check `services/indexer` reactions verification before shipping.
- A passkey prompt (biometric) on every like or reaction is bad UX. Keep reactions on zkLogin, or a session key, and reserve passkey signing for value-moving actions (tips, payments, recovery).

### Gaps
- No official Mysten "passkey wallet for dApp Kit" package found; whether the zktx-io kit is maintained in late 2026 is unknown.

## 3. Enoki sponsorship with a passkey or multisig sender; self-run fallback

### Takeaway
Enoki's HTTP API makes `sender` an explicit alternative to the `zklogin-jwt` header for private-key backend calls. That is exactly how ReeF already calls it. Nothing in the docs restricts `sender` to zkLogin addresses, so passkey and multisig senders should be sponsorable, **but this is not explicitly documented — test on testnet**. Fallback: run your own gas station, since Sui's sponsored-transaction protocol is signer-agnostic.

### Cited Findings
- `POST /v1/transaction-blocks/sponsor` takes `sender` (optional): "The address sending the transaction. Include this parameter if not including the `zklogin-jwt` header… only supported when calling the API from a backend service using a private key." Other fields are `transactionBlockKindBytes`, `network`, `allowedAddresses` and `allowedMoveCallTargets`. The `zklogin-jwt` header is optional — [Enoki OpenAPI](https://docs.enoki.mystenlabs.com/http-api/openapi)
- Enoki's SDK examples include a sponsored transaction whose sender is derived from an **admin secret key** (a plain Ed25519 address, not zkLogin). That shows non-zkLogin senders are a supported pattern — [Enoki TS SDK examples](https://docs.enoki.mystenlabs.com/ts-sdk/examples)
- Sponsorship is fronted as a zkLogin feature ("send transactions to zkLogin accounts…") and requires a private API key. Gas caps are configured in the Enoki portal — [Enoki sponsored transactions](https://docs.enoki.mystenlabs.com/ts-sdk/sponsored-transactions); [Sui docs DeFi zkLogin example](https://docs.sui.io/getting-started/examples/defi-trading-zklogin)
- Shinami Gas Station is an alternative hosted sponsor — [Shinami gas station](https://docs.shinami.com/reference/gas-station-1)

### Inferences
- ReeF already passes `sender` without a JWT (`sponsor.ts`), so the zkLogin binding is evidently not enforced server-side. A passkey or multisig sender should therefore "just work". The user signs the `bytes`, and `executeSponsoredTransaction(digest, signature)` accepts a serialized passkey or multisig signature, because Enoki only adds the sponsor signature and submits **[UNVERIFIED — do a testnet smoke test with a `PasskeyKeypair` sender and a 1-of-2 multisig sender]**.
- Abuse surface: with arbitrary `sender` accepted, the endpoint will sponsor any address that sends allowlisted calls. That's the same as today, so per-user rate limits at the sponsor route remain important.
- Self-run fallback: keep a hot sponsor `Ed25519Keypair` on Render (`services/indexer`). Flow: `Transaction.fromKind(kindBytes)`, `setSender(user)`, `setGasOwner(sponsor)`, `setGasPayment(sponsorCoins)`, `build()`, then the user signs, the sponsor signs, and you `executeTransactionBlock({ signature: [userSig, sponsorSig] })`. Costs: you must manage the gas coin pool (split coins to avoid equivocation and locking under concurrency; this is the hard part Enoki/Shinami solve), replicate the Move-call allowlist checks yourself, and monitor the balance. Enoki remains preferable while it accepts these senders.

### Gaps
- No Enoki doc explicitly mentions passkey or multisig senders. Enoki's FAQ was not read in full.
- Whether Enoki's per-address gas caps or "user" accounting key off the sender address or the JWT subject when no JWT is sent.

## 4. zkLogin + passkey multisig as recovery: address changes and owned-object migration

### Takeaway
A multisig address is a new address, derived from the set of member public keys plus weights plus threshold. Moving an existing ReeF user to `1-of-2 {zkLogin, passkey}` means a new sender, and every owned object (Profile, Post, FollowSet, coins) must be transferred. The `Registry` and indexer mappings keyed by owner must also be updated. For existing users this is a migration, not a toggle.

### Cited Findings
- zkLogin can be a member of a Sui multisig. The SDK example is a 1-of-2 {regular key, zkLogin}, so funds stay reachable if the app or OAuth issuer disappears. Up to 10 members, with custom weights and threshold — [Mysten SDK multisig docs](https://sdk.mystenlabs.com/typescript/cryptography/multisig); [Sui blog: zkLogin multisig recovery](https://blog.sui.io/zklogin-apple-multi-sig-update/)
- Passkey keypairs and public keys work as multisig members, both for address derivation and for signing — [Mysten SDK multisig docs](https://sdk.mystenlabs.com/sui/cryptography/multisig)
- Sui passkey guidance: WebAuthn never exposes private keys, recovery depends on the vendor's cloud sync, and high-value accounts should not rely on a single passkey; use multisig with independent recovery paths — [docs.sui.io passkeys](https://docs.sui.io/develop/cryptography/passkeys.md) (summary via search; the direct `.md` fetch returned 404)
- Code fact (CLAUDE.md D-1): `Profile`, `Post` and `FollowSet` are owned by the user's address. `Registry` (shared) maps owner→profile and handle→profile, and `Profile.owner` is a stored field. `change_handle` exists, but there is no ownership-transfer entry point listed in the module interfaces (repo source).

### Inferences
- **Address math:** for a zkLogin member, the multisig public key embeds the zkLogin address seed (iss + addressSeed), so the multisig address is stable as long as the same Google `sub` and salt are used. Enoki manages the salt, so you depend on Enoki returning the same salt. Losing Google then leaves the passkey path; losing the passkey leaves the Google path.
- **Migration cost for existing users:**
  - Owned objects with `key + store` can be moved with `transfer::public_transfer` in one PTB. ReeF's objects carry an internal `owner` / `author` field and are author-gated, so a plain transfer would leave `Profile.owner` stale and break `edit_post` gates. You need a new Move function, e.g. `profile::migrate_owner(reg, profile, new_owner, ...)`, that updates `Registry` (`profile_of[old]` → new) and emits an event. Posts are author-gated on `author == sender`, so either add `post::migrate_author` (one call per post, batched in PTBs of up to ~1024 commands) or leave old posts frozen to the old address. Package upgrade needed.
  - Coins and USDC move with a simple transfer. Messaging group memberships, Seal policies keyed to the old address, Walrus blob ownership, the SuiNS leaf-subname target (`<handle>.umbra.sui` → address), and DeepBook BalanceManager ownership each need re-pointing **[enumerate per feature]**.
  - The indexer must treat `migrate_owner` events as an address alias so the follower graph and history survive. Followers' `FollowSet` edges are keyed by the followee address and stored in other users' owned objects you cannot rewrite, so the indexer must map old→new.
- **Cheaper design for new users:** create the multisig at onboarding (before any objects exist) so the address never changes. That conflicts with zero-friction onboarding, since passkey creation is an extra biometric step, so it is best offered as a post-onboarding "secure your account" step that triggers the migration. Alternative: keep the zkLogin address as the canonical identity and use the passkey only as a **separate payments sub-account** (its own address) linked from the Profile. No migration is needed, at the cost of two balances.
- Signing UX for a 1-of-2 multisig: each tx needs only one member signature, wrapped as a `MultiSig` signature with the member bitmap. The user does not get two prompts.

### Gaps
- Whether Enoki's zkLogin wallet (`registerEnokiWallets` / `EnokiFlow`) exposes the zkLogin public identifier / address seed needed to build a `MultiSigPublicKey`, or whether you must derive it from the JWT and salt yourself.
- Whether Enoki sponsorship accepts multisig senders (see §3).

## 5. Private payments patterns realistic today on Sui; Nigeria regulatory considerations

### Takeaway
Sui's native **Confidential Transfers** (amounts and balances hidden, sender and receiver visible, auditor access) is the strategic path, but as of the latest primary source it is Devnet beta, with Testnet "targeted later this year" and no mainnet date. Since ReeF is testnet-only, it may be prototypable soon. For production today, realistic privacy is limited: Seal-encrypted memos (payment context hidden, amount and parties public), fresh receive addresses (weak against graph analysis), and off-chain channel batching. Nigeria's 2025 ISA treats digital assets as securities and classifies VASPs as financial institutions under AML law, so "auditable privacy" (amount confidentiality with compliance access) is the defensible framing, not anonymity.

### Cited Findings
- Confidential Transfers public beta (2026-06-08, updated 2026-07-22): balances and amounts are "not publicly visible onchain" when an issuer enables confidential mode. Senders and receivers "remain visible". Live on Devnet, with Testnet "targeted later this year". Code, docs, examples and a prototype wallet are at `github.com/MystenLabs/confidential-transfers`. Launch partners are Bridge, TRM Labs and Merkle Science. No mention of USDC specifically or of sponsored transactions — [Sui blog: Confidential Transfers public beta](https://www.sui.io/blog/confidential-transfers-public-beta)
- Adeniyi Abiodun (May 2026) said native, protocol-level private transactions focused on stablecoins are coming to mainnet. Reports conflict on whether privacy will be default or opt-in — [The Defiant](https://thedefiant.io/sui-rallies-40-as-mysten-labs-promises-free-private-payments-at-scale); [BlockEden (default framing)](https://blockeden.xyz/blog/2026/03/12/sui-protocol-level-private-transactions-default-privacy/); [Merkle Science Q&A](https://www.merklescience.com/blog/q-a-with-abhinav-garg-sui-confidential-transfers-privacy-and-compliance)
- Nigeria: ISA 2025 s.357 defines securities to include virtual and digital assets, and gives the SEC power to register and regulate digital asset exchanges. Marketing digital assets to Nigerians requires SEC approval — [Mondaq: ISA 2025 and digital assets](https://www.mondaq.com/nigeria/fin-tech/1623238/what-the-investment-and-securities-act-2025-means-for-digital-and-virtual-assets-in-nigeria); [TechCabal](https://techcabal.com/2025/05/09/investments-and-securities-act-nigeria-2025/); [Nairametrics](https://nairametrics.com/2025/04/04/isa-2025-nigeria-formally-recognizes-cryptocurrency-as-securities-in-new-sec-act-2025/)
- VASPs are "financial institutions" under the Money Laundering (Prohibition and Prevention) Act. Travel Rule obligations run through SEC licensing and the AML infrastructure framework, but as of Aug 2025 there were no formal enforcement actions — [Sumsub: crypto compliance in West Africa](https://sumsub.com/media/spotlight/crypto-compliance-in-west-africa/); [Busha: legal status](https://blog.busha.io/legal-status-of-digital-assets-in-nigeria)
- Nigeria pursued FATF grey-list exit with strengthened crypto rules (Apr 2025) — [Nairametrics](https://nairametrics.com/2025/04/10/nigeria-set-to-exit-financial-action-task-force-grey-list-with-robust-crypto-regulations/)

### Inferences
- **Ranked patterns for ReeF:**
  1. **Seal-encrypted payment memo**, shippable now. ReeF already runs Seal + Walrus for E2EE chat. Attach an encrypted note ("for jollof Friday") to a tip or transfer: store a Walrus blob id or a small ciphertext in an event, with a Seal policy limited to {sender, recipient}. Hides context, not amount or parties. Low regulatory risk.
  2. **Pay-in-DM**: route payment UX through the existing encrypted messaging so the social context is private. The on-chain transfer remains public.
  3. **Confidential Transfers prototype on testnet** once it lands there. It hides amounts, keeps parties visible, and has auditor keys, which maps well to Nigerian AML expectations. Dependencies: does the token issuer (e.g. Circle for USDC) need to enable confidential mode? The beta post says confidentiality is issuer-enabled. Does it compose with Enoki sponsorship and the move-call allowlist (new framework targets to allowlist)? Does the proof generation run on Hermes / low-end phones? **[all UNVERIFIED]**
  4. **Fresh per-payment receive addresses**, stealth-like. Possible with derived Ed25519 child keys, but each fresh address needs gas to sweep (sponsorship helps), and the sweep links addresses again. Weak privacy for real cost; not recommended.
  5. **State channels / tunnels** (see the repo's existing tunnels research): hide per-tip granularity, so only open and close settle on-chain. Fits creator micro-tips.
  6. **Nautilus TEE relay** (mixing / pooling custodian): makes ReeF a custodian/VASP under ISA 2025 and looks like mixing to AML. Avoid.
- **Regulatory posture (high level, not legal advice):** avoid anonymity or mixer framing. Prefer "amounts private from the public, auditable by regulators". Keep the counterparty-visible design. If ReeF ever offers fiat on/off-ramp, custody, or exchange functions in Nigeria, it likely needs SEC registration as a VASP and triggers AML/KYC and Travel Rule obligations. A non-custodial app with self-custodial zkLogin/passkey wallets is a weaker trigger, but marketing digital assets to Nigerians still needs SEC approval under ISA 2025.

### Gaps
- No primary source found on CBN 2026 actions, or on Nigerian treatment of privacy coins or confidential-transfer features specifically. Final status of the amended SEC digital-asset rules (draft Dec 2024, target June 2025) is unconfirmed.
- Whether Confidential Transfers reached Testnet by Nov 2026: the latest primary source (July 2026) still says "later this year".
- Confidential Transfers' client SDK API, proof costs, and USDC issuer opt-in.

## 6. Comparable consumer apps: lessons

### Takeaway
Coinbase's Base App uses passkey-controlled smart accounts with a separate recovery key/phrase that can add new passkey owners. That is the account-abstraction analogue of a Sui multisig with weighted members. Without a backup, a lost passkey means lost funds, and users see that as the self-custody trade-off.

### Cited Findings
- Base App runs on Coinbase Smart Wallet, a passkey-secured, self-custodial embedded wallet. A recovery key can add new passkey owners if one is lost, and users link Farcaster accounts from the social tab — [Base docs](https://docs.base.org/base-app); [Base smart wallet docs](https://docs.base.org/identity/smart-wallet/llms.txt)
- Coinbase help: set up a recovery phrase to avoid losing access through passkey deletion or device loss — [Coinbase help: smart wallet recovery](https://help.coinbase.com/en/wallet/getting-started/smart-wallet-recovery)
- Lose the passkey without a backup and you lose access (third-party review; Reddit sentiment: "that's the trade-off of self-custody") — [CryptoSlate review](https://cryptoslate.com/?p=521947); [Reddit r/BASE](https://redlib.hackliberty.org/r/BASE/comments/1r88icf/in_base_app_if_you_lose_your_passkey_you_lose)
- Circle's modular wallets use a recovery key to generate a new passkey. Ripple Palisade: lose your only passkey and you lose access — [Circle: recover passkey](https://developers.circle.com/wallets/modular/recover-passkey); [Ripple Palisade FAQ](https://docs.ripple.com/products/wallet/custom_pages/palisade-identity-user-guide-faq)

### Inferences
- On Sui there is no smart-account "add owner", because multisig membership is baked into the address. ReeF's equivalent of Base's model is to decide the member set at onboarding, e.g. `1-of-2 {zkLogin(Google), passkey}` or `2-of-3 {zkLogin, passkey, ReeF-held recovery key}` with weights. Otherwise every change of member set forces an address migration (§4). That is the key architectural difference from EVM AA and a strong argument for deciding before mainnet.
- ReeF's zkLogin already gives "Google is the recovery". Adding a passkey mainly guards against Google account loss and Enoki/app deprecation. For Lagos users, losing a phone is common, while Google accounts persist, so zkLogin-first with an optional passkey is the right default ordering.

### Gaps
- Farcaster/Warpcast: no 2026 primary source found on their wallet's passkey and recovery choices.
- Telegram Wallet / TON Wallet self-custodial (W5) recovery design: no results found in this pass.
