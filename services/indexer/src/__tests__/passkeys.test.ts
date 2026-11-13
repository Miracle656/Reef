import { describe, expect, it } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { toBase64 } from "@mysten/sui/utils";
import { addressAliasesId, canonicalPasskeyRecordBytes, type PasskeyRecordMessage } from "@umbra/core";
import { softwarePasskey } from "../dev/software-passkey";
import { checkPasskeyRecord } from "../passkeys";
import { makeVerifySignedBy } from "../signer";

const owner = new Ed25519Keypair();
const O = owner.toSuiAddress();
const passkey = softwarePasskey();
const other = softwarePasskey();
const NOW = 1_800_000_000_000;

const verify = makeVerifySignedBy({
  readAliases: async () => ({ owner: O, enabled: true, objectId: addressAliasesId(O), aliases: [O, passkey.toSuiAddress()] }),
});

function message(over: Partial<PasskeyRecordMessage> = {}): PasskeyRecordMessage {
  return {
    action: "add",
    owner: O,
    passkey: passkey.toSuiAddress(),
    publicKey: toBase64(passkey.getPublicKey().toRawBytes()),
    credentialId: "Y3JlZC1pZA",
    label: "iPhone",
    timestamp: NOW,
    ...over,
  };
}
const signedBy = async (signer: { signPersonalMessage: (b: Uint8Array) => Promise<{ signature: string }> }, m = message()) => ({
  message: m,
  signature: (await signer.signPersonalMessage(canonicalPasskeyRecordBytes(m))).signature,
});

describe("recovery passkey records", () => {
  it("accepts an add signed by the account", async () => {
    expect(await checkPasskeyRecord(await signedBy(owner), verify, NOW)).toBeNull();
  });

  it("accepts a remove signed by an alias (the passkey itself, after losing Google)", async () => {
    expect(await checkPasskeyRecord(await signedBy(passkey, message({ action: "remove" })), verify, NOW)).toBeNull();
  });

  it("refuses records nobody authorised", async () => {
    expect(await checkPasskeyRecord(await signedBy(new Ed25519Keypair()), verify, NOW)).toBe("bad signature");
  });

  it("refuses a public key that isn't the passkey address's key", async () => {
    const m = message({ publicKey: toBase64(other.getPublicKey().toRawBytes()) });
    expect(await checkPasskeyRecord(await signedBy(owner, m), verify, NOW)).toMatch(/doesn't match/);
  });

  it("refuses stale (replayed) records", async () => {
    expect(await checkPasskeyRecord(await signedBy(owner), verify, NOW + 11 * 60_000)).toBe("stale timestamp");
  });

  it("binds every field: a tampered label fails the signature", async () => {
    const signed = await signedBy(owner);
    signed.message = { ...signed.message, label: "attacker" };
    expect(await checkPasskeyRecord(signed, verify, NOW)).toBe("bad signature");
  });
});
