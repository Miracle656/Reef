import { describe, expect, it } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { addressAliasesId, type AliasState } from "@umbra/core";
import { softwarePasskey } from "../dev/software-passkey";
import { makeVerifySignedBy } from "../signer";

const msg = new TextEncoder().encode("reef:like:0xfeed:1");
const owner = new Ed25519Keypair(); // stands in for the zkLogin account
const passkey = softwarePasskey();
const stranger = new Ed25519Keypair();
const O = owner.toSuiAddress();

const state = (enabled: boolean, aliases: string[]): AliasState => ({ owner: O, enabled, objectId: addressAliasesId(O), aliases });
const verifier = (s: AliasState | Error) =>
  makeVerifySignedBy({ readAliases: async () => (s instanceof Error ? Promise.reject(s) : s) });
const sig = async (k: { signPersonalMessage: (m: Uint8Array) => Promise<{ signature: string }> }) => (await k.signPersonalMessage(msg)).signature;

describe("verifySignedBy (address_alias rule for off-chain messages)", () => {
  it("no aliases: the owner's own key only", async () => {
    const v = verifier(state(false, [O]));
    expect(await v(O, msg, await sig(owner))).toBe(true);
    expect(await v(O, msg, await sig(passkey))).toBe(false);
  });

  it("aliases enabled: a listed recovery passkey can sign as the owner", async () => {
    const v = verifier(state(true, [O, passkey.toSuiAddress()]));
    expect(await v(O, msg, await sig(passkey))).toBe(true);
    expect(await v(O, msg, await sig(owner))).toBe(true);
    expect(await v(O, msg, await sig(stranger))).toBe(false);
  });

  it("a key rotated out of the set can no longer sign, even the owner's own", async () => {
    const v = verifier(state(true, [passkey.toSuiAddress()]));
    expect(await v(O, msg, await sig(owner))).toBe(false);
    expect(await v(O, msg, await sig(passkey))).toBe(true);
  });

  it("rejects a valid signature over different bytes", async () => {
    const v = verifier(state(true, [O, passkey.toSuiAddress()]));
    const other = (await passkey.signPersonalMessage(new TextEncoder().encode("something else"))).signature;
    expect(await v(O, msg, other)).toBe(false);
  });

  it("if the alias read fails, falls back to the owner's own key only", async () => {
    const v = verifier(new Error("network down"));
    expect(await v(O, msg, await sig(owner))).toBe(true);
    expect(await v(O, msg, await sig(passkey))).toBe(false);
  });
});
