# Passkey wallets / passkey signing on Sui (state as of 2026-11-02)

Context: ReeF (Umbra) uses Google zkLogin via Enoki plus Enoki-sponsored transactions, with a web app on vercel.app and an Expo mobile app. Local SDK checked: `@mysten/sui` 2.19.0 and `@mysten/enoki` 1.1.1 from the repo's node_modules. Protocol config checked from `MystenLabs/sui` main (MAX_PROTOCOL_VERSION = 141) on 2026-11-02.

## 1. Protocol: SIP-9 passkey signature scheme, encoding, rollout

### Takeaway
Passkeys are native Sui authenticators under SIP-9 (status Final). They use signature flag `0x06`, an inner secp256r1 signature, and the WebAuthn authenticatorData and clientDataJSON passed through unchanged. Rollout went devnet (protocol v52), then testnet (v75, multisig v76), then mainnet with multisig at v90. Sui announced mainnet on 2025-08-07, so this is mature and not a 2026 novelty.

### Cited Findings
- SIP-9 "Passkey Signature Scheme Support": status Final, type Standard/Core, created 2023-08-01. Authors are Krešimir Klas, Kostas Chalkias, Joy Wang, Ben Riva and Brandon Williams. It is a new scheme because WebAuthn does not sign arbitrary messages and its payload does not fit the existing secp256r1 scheme. — [SIP-9](https://github.com/sui-foundation/sips/blob/main/sips/sip-9.md)
- Flag `0x06`. The serialized signature is `0x06 || BCS(PasskeyAuthenticator{ authenticatorData: bytes, clientDataJson: string, userSignature: bytes })`. Here `userSignature = 0x02 (secp256r1 flag) || 64-byte compact r||s || 33-byte compressed pk`. — [SIP-9](https://github.com/sui-foundation/sips/blob/main/sips/sip-9.md); confirmed in SDK source `node_modules/@mysten/sui/src/keypairs/passkey/keypair.ts` (`sign()`), where `PASSKEY_PUBLIC_KEY_SIZE = 33` and `PASSKEY_SIGNATURE_SIZE = 64` (`publickey.ts`).
- The ECDSA signature covers `authenticatorData || sha256(clientDataJSON)`. The validator requires `clientDataJSON.type == "webauthn.get"`, the challenge must match the intent-message hash, and the sender must equal the address derived from the embedded pk. — [SIP-9](https://github.com/sui-foundation/sips/blob/main/sips/sip-9.md); [sui-types passkey_authenticator.rs](https://raw.githubusercontent.com/MystenLabs/sui/main/crates/sui-types/src/passkey_authenticator.rs)
- **Discrepancy:** SIP-9 text says the WebAuthn challenge is `intent || blake2b(tx_data)`, a 35-byte value. The validator compares the challenge to `to_signing_message(intent_msg)`, which is the `DefaultHash` (Blake2b-256, 32 bytes) of BCS(IntentMessage). The TS SDK likewise passes `blake2b(messageWithIntent(intent, bytes), {dkLen: 32})` as the challenge. Treat the code (32-byte digest) as authoritative. — [passkey_authenticator.rs](https://raw.githubusercontent.com/MystenLabs/sui/main/crates/sui-types/src/passkey_authenticator.rs); SDK `keypair.ts` `signWithIntent`
- The validator does **not** parse authenticatorData flags (UP/UV), the origin or the rpIdHash. authenticatorData is only concatenated into the signed message. The `verify_user_authenticator_epoch` check is a no-op for passkeys, so a passkey signature has no epoch expiry (unlike zkLogin). — [passkey_authenticator.rs](https://raw.githubusercontent.com/MystenLabs/sui/main/crates/sui-types/src/passkey_authenticator.rs)
- Low-S: SIP-9 requires that if `s` is in the upper half of the curve order it be replaced with `n - s`. The TS SDK normalizes this client-side (`sig.hasHighS() ? new Signature(r, Fn.neg(s)) : sig`). — [SIP-9](https://github.com/sui-foundation/sips/blob/main/sips/sip-9.md); SDK `keypair.ts`
- Protocol config changelog (sui-protocol-config lib.rs): v52 "Add support for passkey in devnet". v75 "Enable passkey auth in testnet". v76 "Enable passkey auth in multisig for testnet". v90 "Enable passkey and passkey inside multisig for mainnet". The feature flags are `passkey_auth` and `accept_passkey_in_multisig`. — [sui-protocol-config/src/lib.rs](https://raw.githubusercontent.com/MystenLabs/sui/main/crates/sui-protocol-config/src/lib.rs)
- Sui blog "Sui Introduces Passkey for Seamless User Onboarding" (published 2025-08-07, modified 2026-07-17): "live on Sui Mainnet", with Nimora the first wallet to support it. — [sui.io blog](https://www.sui.io/blog/passkey-seamless-user-onboarding)
- SIP-9 security note: the origin holding the passkey must be a trusted sandbox (standalone app, extension or mobile app), because any code running on that origin can trigger an assertion. An untrusted origin is open to wallet impersonation. — [SIP-9](https://github.com/sui-foundation/sips/blob/main/sips/sip-9.md)
- Some older or mirrored docs still say "beta in Devnet and Testnet, mainnet not scheduled" and "passkeys not supported with Multisig yet". **These are outdated**: the protocol config shows both enabled on mainnet at v90. — search snippet of [docs.sui.io passkeys](https://docs.sui.io/concepts/cryptography/passkeys) and a Vercel-hosted docs mirror

### Inferences
- The date of protocol v90 on mainnet is not stated in the sources I read. Since the mainnet blog post is dated 2025-08-07, v90 most likely reached mainnet around mid-2025 (unverified).
- The chain does not check UV or origin, so user-verification policy is enforced only by the client and authenticator. A malicious script on the RP origin (for example XSS on the ReeF web app) can request a signature, which the user still confirms with a biometric or PIN prompt. Origin hygiene (CSP, no third-party script injection) is the real security boundary.

### Gaps
- I found no exact mainnet activation date or release tag for protocol v90 in the sources read.
- I found no public third-party audit specific to the passkey authenticator. Kostas Chalkias and Ben Riva of Mysten Labs cryptography are SIP authors, but I did not locate an audit report.

## 2. TypeScript SDK API (`@mysten/sui/keypairs/passkey`, v2.x)

### Takeaway
The SDK ships `PasskeyKeypair` (still marked `@experimental`), `BrowserPasskeyProvider`, a pluggable `PasskeyProvider` interface and `findCommonPublicKey`. The public key comes back only at credential creation, so the app must persist it (or the address). Otherwise it has to recover it via ECDSA public-key recovery, which needs two signatures to get a unique key or one signature plus an on-chain lookup.

### Cited Findings
- Exports from `@mysten/sui/keypairs/passkey`: `BrowserPasskeyProvider`, `BrowserPasswordProviderOptions` (sic, "Password"), `PasskeyKeypair` and `findCommonPublicKey`. Methods: static `getPasskeyInstance(provider)`, static `signAndRecover(provider, message)`, `getPublicKey()`, `signPersonalMessage`, `signTransaction` and `getCredentialId()`. The constructor is `new PasskeyKeypair(publicKey: Uint8Array, provider, credentialId?)`. — [SDK docs: Passkey](https://sdk.mystenlabs.com/sui/cryptography/passkey); SDK source `keypair.ts` (2.19.0)
- `PasskeyProvider` interface: `create(): Promise<RegistrationCredential>` and `get(challenge, credentialId?): Promise<AuthenticationCredential>`. `BrowserPasskeyProvider` implements it with `navigator.credentials.create/get`. A custom provider (for example React Native) can be plugged in. — SDK source `keypair.ts`
- `BrowserPasskeyProvider.create()` defaults:
  - `pubKeyCredParams: [{alg: -7}]` (ES256 only)
  - `authenticatorSelection: { authenticatorAttachment: 'cross-platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' }`, which callers may override
  - `user.id = randomBytes(10)`, so every create makes a new discoverable credential
  - fixed challenge "Create passkey wallet on Sui"
  - timeout 60 s
  
  `get()` uses `userVerification: 'required'` unless overridden and sets `allowCredentials` when a credentialId is known. — SDK source `keypair.ts`
- **Default attachment gotcha:** the default is `'cross-platform'` (security keys or phone via QR/hybrid). To get Face ID, Touch ID, Windows Hello or Android platform passkeys you must pass `authenticatorAttachment: 'platform'`, as the docs example does. — [SDK docs](https://sdk.mystenlabs.com/sui/cryptography/passkey); SDK source
- `getPasskeyInstance` parses the DER SPKI public key from the registration response (`response.getPublicKey()`), compresses it to 33 bytes and stores `rawId` as the credentialId. Docs: "should only be called if passkey wallet is created for the first time." — SDK source `keypair.ts`
- `signAndRecover` signs a message and returns up to 4 candidate public keys (recovery bits 0–3) over `sha256(authenticatorData || sha256(clientDataJSON))`. `findCommonPublicKey(a, b)` intersects two candidate sets and throws unless exactly one key matches. With one signature, the docs say to check each candidate address on-chain for assets or past transactions. — SDK source; [SDK docs](https://sdk.mystenlabs.com/sui/cryptography/passkey)
- Docs guidance:
  - Cache the `PasskeyKeypair` instance (the public key) in the frontend.
  - Create one passkey wallet per origin, because several passkeys produce a confusing chooser list.
  - After logout, on a new browser or device, or when the cached instance is lost, the user must recover. Creating a new passkey yields a **new address**.
  
  — [SDK docs](https://sdk.mystenlabs.com/sui/cryptography/passkey)
- Changelog: passkey SDK added in 1.17.0, "recover passkey option" in 1.20.0, "passkey: add it to multisig" in 1.36.1, and in 2.8.0 "Add credentialId support to PasskeyKeypair for targeted credential selection during signing". — `node_modules/@mysten/sui/CHANGELOG.md` (2.19.0)
- Reference implementation: the docs point to the MystenLabs passkey-example repository. — [SDK docs](https://sdk.mystenlabs.com/sui/cryptography/passkey)
- Community wrappers exist: `@zktx.io/sui-passkey-kit` and `@zero-lync/passkey-sui` (testnet option). These are third-party and unaudited as far as I found. — [pkgstats sui-passkey-kit](https://www.pkgstats.com/pkg:@zktx.io/sui-passkey-kit); [pkgstats passkey-sui](https://www.pkgstats.com/pkg:@zero-lync/passkey-sui)

### Inferences
- For ReeF, the robust pattern is to store `{credentialId, compressedPk, address}` server-side, keyed to the user (for example in the indexer DB next to the profile), and in localStorage. A returning user on a new device then gets the address without recovery prompts, and `allowCredentials` targeting avoids the chooser. The pk is public data, so storing it server-side is safe.
- The `getCredentialId()` and credentialId constructor argument only exist from 2.8.0, which the repo's 2.19.0 includes.
- Mobile (Expo) needs a custom `PasskeyProvider` built on a native passkey module such as react-native-passkey (not verified in sources). The SDK only ships the browser provider.

### Gaps
- I did not verify a Mysten-maintained React Native passkey provider. I found none in the SDK.

## 3. Address derivation and multisig (passkey + zkLogin)

### Takeaway
Address = `blake2b256(0x06 || 33-byte compressed pk)`, which is distinct from a raw secp256r1 address for the same key. Passkeys and zkLogin can both be members of one Sui multisig (max 10 members, weighted threshold), and that has been enabled on mainnet since protocol v90. But a multisig has its **own new address**, so adding passkey recovery to an existing zkLogin user means migrating to a new address.

### Cited Findings
- Address derivation: `blake2b_hash(flag_passkey || pk_passkey)` with flag `0x06`. — [SIP-9](https://github.com/sui-foundation/sips/blob/main/sips/sip-9.md); `PublicKey::Passkey` maps to `SignatureScheme::PasskeyAuthenticator` (flag 0x06) in [sui-types crypto.rs](https://raw.githubusercontent.com/MystenLabs/sui/main/crates/sui-types/src/crypto.rs)
- Multisig: `MAX_SIGNER_IN_MULTISIG = 10`. Verification rejects zkLogin sigs unless `accept_zklogin_in_multisig` is set, and passkey sigs unless `accept_passkey_in_multisig` is set. Both are enabled on mainnet: zkLogin in multisig earlier, passkey in multisig at v90. — [sui-types multisig.rs](https://raw.githubusercontent.com/MystenLabs/sui/main/crates/sui-types/src/multisig.rs); [protocol config](https://raw.githubusercontent.com/MystenLabs/sui/main/crates/sui-protocol-config/src/lib.rs)
- The TS SDK multisig types include `{ Passkey: Uint8Array }` as a member public key variant, and `PasskeyKeypair`/`PasskeyPublicKey` can be used as multisig components. — SDK source `src/multisig/publickey.ts`; [SDK multisig docs](https://sdk.mystenlabs.com/sui/cryptography/multisig)
- Sui blog: "Passkey on Sui also supports advanced use cases like multisig wallets", including pairing passkey with zkLogin for security and recovery. — [sui.io blog](https://www.sui.io/blog/passkey-seamless-user-onboarding)
- The zkLogin+multisig recovery rationale: zkLogin depends on the app's OAuth client ID and the issuer (Google) staying live. A 1-of-2 multisig with another key keeps funds reachable if the app or issuer goes away. Multisig can span up to 10 accounts with custom weights and thresholds. — [Sui blog: zkLogin multi-sig recovery](https://blog.sui.io/zklogin-apple-multi-sig-update/)
- docs.sui.io: passkey can be combined with other auth types in 2-of-2 or m-of-n multisig for recovery and shared access. It also advises against relying on a single passkey for high-value or admin accounts. — [docs.sui.io passkeys](https://docs.sui.io/concepts/cryptography/passkeys)
- The Rust SDK added passkey-in-multisig with a check that the member pk equals the authenticator's embedded pk. — [sui-rust-sdk commit 6d7fab81](https://github.com/MystenLabs/sui-rust-sdk/commit/6d7fab81)

### Inferences
- A 1-of-2 `{zkLogin(Google via Enoki), passkey}` multisig lets either factor sign alone, giving passkey-as-recovery. Each zkLogin member is a `ZkLoginPublicIdentifier` (iss + address seed), so the Enoki-derived address seed for the user must be known when the multisig is created.
- **Address migration problem for ReeF:** Profiles, Posts and FollowSets are owned by the user's current zkLogin address (D-1). Switching a user to a multisig address means transferring every owned object and updating Registry `profile_of`. The multisig's member set is also fixed, because Sui multisig has no native key rotation (changing members changes the address). A simpler alternative is "passkey as an additional, independent account" or an app-level recovery delegate, but that is not a cryptographic recovery of the zkLogin address.
- A multisig sender cannot use Enoki's `jwt` sponsorship mode, which assumes the zkLogin address. It needs the `sender` mode (see section 5).
- Combining signatures (zkLogin sig + passkey sig) is done client-side with `MultiSigPublicKey.combinePartialSignatures`. For 1-of-2 only one partial is needed.

### Gaps
- I did not find a Mysten example that specifically builds a zkLogin + passkey multisig end to end in TS (the SDK multisig page fetch returned 404 for the .md variant).
- I did not verify whether Enoki's `getZkLoginAddresses` or its other APIs expose the address seed needed to build the zkLogin multisig member pk.

## 4. Wallet and product adoption on Sui

### Takeaway
Adoption is thin. Nimora (a Chrome extension) was the launch-partner "first wallet" with passkey login. I found no evidence that Slush (Mysten's wallet) shipped passkey login by late 2026, only a "planned" mention. Passkeys on Sui are mainly an SDK primitive for apps to embed, not a mainstream wallet feature.

### Cited Findings
- Nimora is "the first wallet to support passkey" per the Sui mainnet announcement. Its Chrome Web Store listing describes passkey login, send/receive/swap and dApp support. A search snippet showed a small user base (about 11 users, 1 rating), not verified directly. — [sui.io blog](https://www.sui.io/blog/passkey-seamless-user-onboarding); [Chrome Web Store: Nimora](https://chromewebstore.google.com/detail/eknjljffljhnacdbjaofblafoenecaai)
- Slush: the Slush docs (extension, iOS, Android, web) found do not mention passkey login. A Delphi Digital Sui Q2 report snippet says Slush will merge "account abstraction, zkLogin, and passkey-native flows into a unified interface". This is forward-looking, and the report's date and year are unclear (paywalled). — [docs.sui.io Slush](https://docs.sui.io/onchain-finance/asset-custody/wallets/slush); [Delphi Digital](https://members.delphidigital.io/reports/suis-q2-on-chain-ux-primitives-btcfi-expansion-scaling-production)
- Sui marketing page for passkey: [sui.io/passkey](https://sui.io/passkey) (not fetched).

### Inferences
- Users will not already "have a Sui passkey wallet". ReeF would mint a passkey bound to its own RP ID, so the wallet exists only inside ReeF and its related origins, unlike zkLogin, where Slush/Enoki apps derive the same address for the same Google account and client ID.

### Gaps
- I could not confirm current Slush passkey status from a Slush changelog or blog, and found no other passkey smart-account products on Sui. The "Sui wallets" and "2025 in review" blogs were surfaced but not fetched.

## 5. Sponsored transactions with passkey senders (protocol + Enoki)

### Takeaway
Sponsorship is signer-agnostic at the protocol level. The sender signature can be any authenticator (passkey, multisig, zkLogin) alongside the sponsor's gas-owner signature. Enoki's backend sponsor API has an explicit `sender` mode (no JWT) usable with the private API key, so passkey and multisig senders can be sponsored through Enoki.

### Cited Findings
- `@mysten/enoki` 1.1.1 `CreateSponsoredTransactionApiInput` is a union. One mode is `{ jwt: string }`, where the sender is the zkLogin address from the JWT. The other is `{ sender: string; allowedAddresses?: string[]; allowedMoveCallTargets?: string[] }` with no JWT. `createSponsoredTransaction` POSTs to `transaction-blocks/sponsor` and only sets the `zklogin-jwt` header when a jwt is given. Execution is `executeSponsoredTransaction({ digest, signature })`, where `signature` is any serialized Sui user signature. — `node_modules/@mysten/enoki/dist/EnokiClient/type.d.mts` and `index.mjs`
- Enoki's public docs page only describes the zkLogin-JWT header flow ("send transactions to zkLogin accounts") and does not mention non-zkLogin senders. — [Enoki docs: sponsored transactions](https://docs.enoki.mystenlabs.com/ts-sdk/sponsored-transactions)

### Inferences
- ReeF's sponsor endpoint can keep the same 6-step flow. The client builds kind bytes, the server calls `createSponsoredTransaction({ sender: passkeyAddress, allowedMoveCallTargets, ... })`, the client signs `bytes` with `PasskeyKeypair.signTransaction`, and the server calls `executeSponsoredTransaction`. Without the JWT, Enoki cannot authenticate who the sender is, so the server should bind sender to an authenticated session (for example verify a passkey-signed personal message) to stop sponsorship abuse.
- Each passkey-signed transaction costs one biometric prompt. Hot-path actions (post, follow) would prompt every time, unlike zkLogin's ephemeral key, which signs silently for its session. This is a major UX difference for a social app. A per-session delegate or ephemeral key authorized by the passkey would need app-level design (not native).

### Gaps
- I found no Enoki doc that explicitly states sender-mode sponsorship of passkey or multisig addresses is supported or tested. The finding is inferred from SDK types. It may depend on Enoki portal settings (allowed addresses or Move targets) and needs a testnet check.

## 6. Cross-device sync, loss/recovery, RP ID binding (vercel.app web + mobile)

### Takeaway
A passkey wallet is bound to its RP ID (domain). Synced passkeys (iCloud Keychain, Google Password Manager) roam across a user's devices on one platform ecosystem, and QR hybrid works across ecosystems. **`vercel.app` is on the Public Suffix List**, so the RP ID must be the exact app hostname (for example `reef.vercel.app`). Changing domains later orphans every wallet unless Related Origin Requests are set up. ReeF should pick a permanent custom domain as the RP ID before launching passkeys.

### Cited Findings
- Cloud-synced passkeys (iCloud Keychain, Google Password Manager) enable recovery and cross-device authentication. Mobile approval via QR code from a desktop browser is supported. Non-synced passkeys cannot move between authenticators. Users should set up multiple devices. Cloud sync adds provider or account compromise risk. Some authenticators need a PIN rather than biometrics. — [docs.sui.io passkeys](https://docs.sui.io/concepts/cryptography/passkeys)
- "Passkey wallets are tied to their origin, so they can't be used on a different site." — [docs.sui.io passkeys](https://docs.sui.io/concepts/cryptography/passkeys)
- `vercel.app` (and `vercel.dev`) appear in the Public Suffix List, private section (lines about 16327–16329 of the current list). — [publicsuffix.org list](https://publicsuffix.org/list/public_suffix_list.dat)
- Related Origin Requests (ROR): the RP hosts `/.well-known/webauthn` (application/json) with an `origins` array so other origins can use its RP ID. Clients are only required to support 5 unique labels. Support can be detected via `PublicKeyCredential.getClientCapabilities().relatedOrigins`. — [passkeys.dev: Related Origins](https://passkeys.dev/docs/advanced/related-origins/)
- The SDK docs example sets `rpId: window.location.hostname`. — [SDK docs](https://sdk.mystenlabs.com/sui/cryptography/passkey)

### Inferences
- Because vercel.app is a public suffix, `rpId: "vercel.app"` is invalid. Every preview deployment (`*-git-*.vercel.app`) is a different registrable domain from production, so passkeys made on previews will not work on prod. Using `window.location.hostname` as in the docs would silently create per-host wallets.
- Mobile (Expo/native): native passkey APIs require the RP ID domain to publish association files. On iOS that is `apple-app-site-association` with `webcredentials`; on Android it is `assetlinks.json` with `get_login_creds`. Hosting these on a vercel.app subdomain is technically possible, but a custom domain is safer. This is general platform knowledge, not sourced in this session.
- Recovery reality: a lost synced passkey is recoverable through the user's Apple or Google account. A device-bound key (security key, or a passkey not synced) is unrecoverable, and the wallet address is lost unless it is in a multisig. For Lagos-first users on shared or low-end Android devices without Google Password Manager sync, loss risk is higher than with Google zkLogin.
- Cross-ecosystem (iPhone passkey, Windows laptop) works via QR hybrid but not via sync, which adds friction.

### Gaps
- I did not verify Android Credential Manager or Google Password Manager passkey sync coverage on low-end Android versions common in Nigeria.

## 7. Known issues, audits, gotchas

### Takeaway
The main pitfalls are client-side:
- public-key loss after creation
- the default `cross-platform` attachment
- the random `user.id` creating duplicate wallets
- RP ID drift
- per-transaction biometric prompts
- the SIP text vs code challenge-length mismatch
- the on-chain verifier ignoring UV/UP and origin

The SDK class is still flagged `@experimental` in 2.19.0.

### Cited Findings
- `PasskeyKeypair` is annotated `@experimental` ("A passkey signer used for signing transactions. This is a client side implementation for SIP-9"). — SDK source `keypair.ts` (2.19.0)
- Low-S normalization is required by SIP-9 and done by the SDK. Hand-rolled signers (other languages or native mobile) must replicate it, or validators may reject the signature (rejection not confirmed). — [SIP-9](https://github.com/sui-foundation/sips/blob/main/sips/sip-9.md); SDK `keypair.ts`
- Only the ES256 (`alg: -7`) credential type is requested. Authenticators that only support other algorithms cannot be used. — SDK source `keypair.ts`
- The SDK `verify()` (`PasskeyPublicKey.verify`) checks that the base64url challenge in clientDataJSON equals the message and verifies secp256r1 over `authenticatorData || sha256(clientDataJSON)`, without UV or origin checks. — SDK source `publickey.ts`
- Multiple passkeys per origin cause a confusing chooser, and creating a new one yields a new address. — [SDK docs](https://sdk.mystenlabs.com/sui/cryptography/passkey)
- The Rust SDK changed passkey public key encoding to drop a flag byte (commit 5b61c62a), a reminder that encoding details changed during development. — [sui-rust-sdk commit 5b61c62a](https://github.com/MystenLabs/sui-rust-sdk/commit/5b61c62a)

### Inferences
- Because `user.id` is random per `create()`, ReeF should guard against calling `getPasskeyInstance` for a user who already has a passkey (check server-side first), or it will create a second wallet.
- Indexer impact: signature verification of off-chain reactions (D-2) via `@mysten/sui/verify` should handle flag `0x06` personal-message signatures. `verifyPersonalMessageSignature` dispatches on the scheme, and `PasskeyPublicKey.verify` exists, but this is not tested here.

### Gaps
- I found no published security audit or CVE specific to Sui passkey verification, and no GitHub issues on PasskeyKeypair failures turned up in search.
