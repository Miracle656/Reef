# Passkey recovery (`0x2::address_alias`)

A ReeF account is a zkLogin address tied to one Google account. Lose that
Google account and the address is gone, along with the profile, posts,
followers, handle and chats. #10 adds a **recovery passkey** (Face ID,
fingerprint, Windows Hello) that can sign **as the same address**, using Sui's
`address_alias` protocol feature. The address never changes, so nothing
migrates.

## How it works

- `0x2::address_alias::enable` gives the sender an `AddressAliases` object, a
  derived object of the system state `0xa`, so its id is
  `addressAliasesId(owner)` with no lookup needed. It starts as `{owner}`.
- `add(passkeyAddress)` puts the passkey in the set. From then on **only the
  listed keys** can sign transactions whose sender is `owner`. The zkLogin
  address stays listed, so day-to-day use is unchanged.
- Rotation (a lost phone) is `add(new)` + `remove(old)` in one PTB
  (`buildRotateAliasTx`), signed by any key still in the set.
- Gotchas: `enable` is its own transaction before any `add`. All four functions
  are `entry` (top-level PTB commands only). The set can't be emptied, and it
  holds at most 8 keys.

Code:

- `packages/core/src/contracts/address-alias.ts`: id derivation, `readAliasState`, `canSignFor`, and the tx builders
- `services/indexer/src/signer.ts`: `verifySignedBy`, the same rule for off-chain messages (likes, stories). A listed passkey can sign as the account, and a key rotated *out* can't.
- `services/indexer/src/passkeys.ts` + `RecoveryPasskey` table + tRPC `passkeyRecord` / `passkeysForOwner` / `accountsForPasskey`: stores `{credentialId, publicKey, address}` server-side. Add and remove are both signed by the account or one of its aliases.
- `apps/web/components/secure-account.tsx`: the "Recovery passkey" card (Settings + `/onboarding/secure`)
- Both sponsors allow-list `0x2::address_alias::{enable,add,remove,replace_all}`, so setup is gasless.

## Verified on testnet

`pnpm --filter @umbra/indexer alias:smoke` (2026-11-13, protocol 142, gas from
the self-run sponsor, so no account held SUI). `main` is an Ed25519 key standing
in for the zkLogin account:

| Step | Result |
|---|---|
| 1. main enables aliases | ✅ `AddressAliases` created at the derived id, `= {main}` |
| 2. main adds passkey A | ✅ `{main, A}` |
| 3. **passkey A sends as main** | ✅ the recovery path |
| 4. main still sends as itself | ✅ |
| 5. a stranger sends as main | ✅ rejected by validators ("Invalid user signature") |
| 6. passkey A rotates: add B, remove A (one tx) | ✅ `{main, B}` |
| 7. rotated-out passkey A sends as main | ✅ rejected |
| 8. passkey B sends as main | ✅ |

Passkeys there use the software authenticator (`services/indexer/src/dev`),
which produces the same WebAuthn signature format as a phone.

## Gate before turning it on

The web UI is behind `NEXT_PUBLIC_PASSKEY_RECOVERY=1` and **off by default**.
The protocol is proven with an Ed25519 owner. The one thing a script can't do
is sign in with Google. zkLogin has two address derivations (legacy and
current), so check that a real ReeF zkLogin account keeps signing after
`enable`. Do it **on the production URL** (passkeys are bound to the RP id; see
#9), and **only with a throwaway Google account**. If zkLogin signing ever broke
after `enable`, the `add` that follows is itself zkLogin-signed and would fail
too, leaving that test account with no working key.

1. Set `NEXT_PUBLIC_PASSKEY_RECOVERY=1` on a deploy at the RP id. Sign in with the throwaway Google account and onboard.
2. Settings → Recovery passkey → **Add a passkey**. This runs the `enable` tx, the `add` tx and the record. Both txs succeeding already proves zkLogin signs after `enable`.
3. Like a post and create a post. These are zkLogin-signed, and they must still work with aliases enabled.
4. If all of that passes, leave the flag on for everyone.

With `ENOKI_PRIVATE_API_KEY` set, `alias:smoke` also runs step 3 through Enoki
(step 3b), to confirm Enoki sponsors an aliased sender signed by a passkey.

## Next: using the passkey after losing Google

Adding the passkey is the safety net this PR ships. The sign-in flow that
*uses* it is the follow-up:

1. "Lost access to Google?" on a new device: `PasskeyKeypair.signAndRecover` twice, then `findCommonPublicKey`, gives the passkey address. `accountsForPasskey` then gives the account `X`.
2. Sign in with a **new** Google account, which gives zkLogin address `Y`.
3. The passkey signs **as X**: `buildAddAliasTx(X, Y)`, optionally rotating out the lost zkLogin address with `buildRotateAliasTx`. This is proven by steps 3 and 6 above.
4. The app then needs an "acting as" identity. When the signed-in Enoki address `Y` is an alias of `X`, `useSocialAccount()` returns `X`, and gasless txs use `sender = X` while `Y` signs. The self-run sponsor already handles this (step 3). Whether Enoki sponsors `sender ≠ signer` is the open question that step 3b answers.
