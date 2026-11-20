import { describe, expect, it } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { PasskeyPublicKey } from "@mysten/sui/keypairs/passkey";
import { fromBase64 } from "@mysten/sui/utils";
import { verifyPersonalMessageSignature, verifyTransactionSignature } from "@mysten/sui/verify";
import * as passkey from "../passkey/index";
import { SoftAuthenticator, cancelled } from "./helpers/soft-authenticator";

const { PasskeyError } = passkey;

/** A stand-in for the Sui node's signature check that records what it was asked. */
function fakeNode(answer: { isValid?: boolean; reason?: string } | Error = { isValid: true }) {
  const calls: { name?: string; value?: Uint8Array; signature?: Uint8Array; address?: string }[] = [];
  const client = {
    signatureVerificationService: {
      async verifySignature(req: { message?: { name?: string; value?: Uint8Array }; signature?: { bcs?: { value?: Uint8Array } }; address?: string }) {
        calls.push({ name: req.message?.name, value: req.message?.value, signature: req.signature?.bcs?.value, address: req.address });
        if (answer instanceof Error) throw answer;
        return { response: answer };
      },
    },
  } as unknown as Parameters<typeof passkey.confirmPasskey>[0];
  return { client, calls };
}

async function fails(p: Promise<unknown>, code: passkey.PasskeyErrorCode) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(PasskeyError);
  expect((e as passkey.PasskeyError).code).toBe(code);
}

describe("making a wallet", () => {
  it("turns a new passkey into a wallet whose address is the passkey's own", async () => {
    const device = new SoftAuthenticator();
    const wallet = await passkey.createPasskey(device);
    expect(wallet.address).toMatch(/^0x[0-9a-f]{64}$/);
    expect(wallet.address).toBe(new PasskeyPublicKey(fromBase64(wallet.publicKey)).toSuiAddress());
    expect(fromBase64(wallet.publicKey)).toHaveLength(33);
    // the credential id survives the trip through base64url
    expect(wallet.credentialId).toBe(Buffer.from(device.credentials[0]!.id).toString("base64url"));
    expect(wallet.credentialId).not.toMatch(/[+/=]/);
  });

  it("gives every passkey its own address", async () => {
    const device = new SoftAuthenticator();
    const a = await passkey.createPasskey(device);
    const b = await passkey.createPasskey(device);
    expect(a.address).not.toBe(b.address);
  });

  it("passes a closed prompt through untouched, so the screen can say so", async () => {
    const device = new SoftAuthenticator();
    device.failNext = cancelled();
    const e = await passkey.createPasskey(device).catch((err: unknown) => err);
    expect(passkey.describePasskeyError(e, "create").code).toBe("cancelled");
    expect(device.credentials).toHaveLength(0);
  });
});

describe("confirming a new passkey before it is used", () => {
  it("accepts a real signature and asks the network about exactly that wallet", async () => {
    const device = new SoftAuthenticator();
    const wallet = await passkey.createPasskey(device);
    const signature = await passkey.signPasskeyCheck(wallet, device);
    const node = fakeNode();
    await passkey.confirmPasskey(node.client, wallet, signature);

    expect(node.calls).toHaveLength(1);
    const call = node.calls[0]!;
    expect(call.name).toBe("PersonalMessage");
    expect(call.address).toBe(wallet.address);
    expect(Buffer.from(call.signature!).toString("base64")).toBe(signature);
    // a personal message is sent BCS-wrapped: one length byte, then the text
    expect(call.value![0]).toBe(passkey.PASSKEY_CHECK_MESSAGE.length);
    expect(Buffer.from(call.value!.slice(1)).toString()).toBe(Buffer.from(passkey.PASSKEY_CHECK_MESSAGE).toString());
    // the signing prompt named this wallet's own passkey
    expect(Buffer.from(device.asked.at(-1)!.credentialId!).toString("base64url")).toBe(wallet.credentialId);
  });

  it("is a signature the SDK also accepts as this address's", async () => {
    const device = new SoftAuthenticator();
    const wallet = await passkey.createPasskey(device);
    const signature = await passkey.signPasskeyCheck(wallet, device);
    const key = await verifyPersonalMessageSignature(passkey.PASSKEY_CHECK_MESSAGE, signature, { address: wallet.address });
    expect(key.toSuiAddress()).toBe(wallet.address);
  });

  it("refuses when the network says the signature is no good", async () => {
    const device = new SoftAuthenticator();
    const wallet = await passkey.createPasskey(device);
    const signature = await passkey.signPasskeyCheck(wallet, device);
    await fails(passkey.confirmPasskey(fakeNode({ isValid: false, reason: "signature error" }).client, wallet, signature), "not-confirmed");
    // a missing verdict is not a yes
    await fails(passkey.confirmPasskey(fakeNode({}).client, wallet, signature), "not-confirmed");
  });

  it("reports a network failure as its own case, and the same signature passes on a retry", async () => {
    const device = new SoftAuthenticator();
    const wallet = await passkey.createPasskey(device);
    const signature = await passkey.signPasskeyCheck(wallet, device);
    const prompts = device.asked.length;
    await fails(passkey.confirmPasskey(fakeNode(new Error("fetch failed")).client, wallet, signature), "network");
    await passkey.confirmPasskey(fakeNode().client, wallet, signature);
    expect(device.asked).toHaveLength(prompts); // no second prompt
  });

  it("refuses a signature from another passkey without bothering the network", async () => {
    const device = new SoftAuthenticator();
    const mine = await passkey.createPasskey(device);
    const other = await passkey.createPasskey(device);
    const signature = await passkey.signPasskeyCheck(other, device);
    const node = fakeNode();
    await fails(passkey.confirmPasskey(node.client, mine, signature), "not-confirmed");
    expect(node.calls).toHaveLength(0);
  });

  it("refuses a signature over some other message, and a key that isn't a passkey", async () => {
    const device = new SoftAuthenticator();
    const wallet = await passkey.createPasskey(device);
    const { signature: other } = await passkey.passkeySigner(wallet, device).signPersonalMessage(new TextEncoder().encode("pay everything to mallory"));
    await fails(passkey.confirmPasskey(fakeNode().client, wallet, other), "not-confirmed");
    const { signature: ed } = await new Ed25519Keypair().signPersonalMessage(passkey.PASSKEY_CHECK_MESSAGE);
    await fails(passkey.confirmPasskey(fakeNode().client, wallet, ed), "not-confirmed");
    await fails(passkey.confirmPasskey(fakeNode().client, wallet, "not base64 at all"), "not-confirmed");
  });
});

describe("finding a wallet again", () => {
  it("works the wallet back out of two prompts", async () => {
    const device = new SoftAuthenticator();
    const made = await passkey.createPasskey(device);
    const search = passkey.findPasskey(device);
    await search.first();
    expect(await search.second()).toEqual(made);
    expect(device.asked).toHaveLength(2);
    // the two challenges are different, random, and 32 bytes
    expect(device.asked[0]!.challenge).toHaveLength(32);
    expect(Buffer.from(device.asked[0]!.challenge).equals(Buffer.from(device.asked[1]!.challenge))).toBe(false);
  });

  it("lets the person pick on the first prompt and holds the second to the same passkey", async () => {
    const device = new SoftAuthenticator();
    await passkey.createPasskey(device);
    const second = await passkey.createPasskey(device);
    await passkey.createPasskey(device);
    device.pick = 1;
    const search = passkey.findPasskey(device);
    await search.first();
    expect(device.asked[0]!.credentialId).toBeUndefined();
    device.pick = 2; // the person would now pick another one, but isn't offered it
    expect(await search.second()).toEqual(second);
    expect(Buffer.from(device.asked[1]!.credentialId!).toString("base64url")).toBe(second.credentialId);
  });

  it("stops if a different passkey answers the second time", async () => {
    const device = new SoftAuthenticator();
    await passkey.createPasskey(device);
    await passkey.createPasskey(device);
    device.ignoreRequestedPasskey = true;
    const search = passkey.findPasskey(device);
    await search.first();
    device.pick = 1;
    await fails(search.second(), "different-passkey");
  });

  it("can be started over after a closed prompt", async () => {
    const device = new SoftAuthenticator();
    const made = await passkey.createPasskey(device);
    const search = passkey.findPasskey(device);
    device.failNext = cancelled();
    const e = await search.first().catch((err: unknown) => err);
    expect(passkey.describePasskeyError(e, "find").code).toBe("cancelled");
    await expect(search.second()).rejects.toThrow(/first\(\)/);

    await search.first();
    device.failNext = cancelled();
    await search.second().catch(() => {});
    expect(await search.second()).toEqual(made); // the second prompt alone can be retried
  });

  it("says so when the device has no passkey to offer", async () => {
    const e = await passkey
      .findPasskey(new SoftAuthenticator())
      .first()
      .catch((err: unknown) => err);
    expect(passkey.describePasskeyError(e, "find")).toMatchObject({ code: "cancelled", message: expect.stringContaining("no ReeF passkey") });
  });

  it("uses the challenges it is given", async () => {
    const device = new SoftAuthenticator();
    const made = await passkey.createPasskey(device);
    let n = 0;
    const search = passkey.findPasskey(device, () => new Uint8Array(32).fill(++n));
    await search.first();
    expect(await search.second()).toEqual(made);
    expect(device.asked.map((a) => a.challenge[0])).toEqual([1, 2]);
  });
});

describe("what the app remembers", () => {
  it("reads back what it saved", async () => {
    const wallet = await passkey.createPasskey(new SoftAuthenticator());
    expect(passkey.parsePasskeyWallet(passkey.serializePasskeyWallet(wallet))).toEqual(wallet);
  });

  it("drops a record whose address doesn't belong to its key", async () => {
    const device = new SoftAuthenticator();
    const mine = await passkey.createPasskey(device);
    const theirs = await passkey.createPasskey(device);
    const swapped = JSON.stringify({ v: 1, ...mine, address: theirs.address });
    expect(passkey.parsePasskeyWallet(swapped)).toBeNull();
  });

  it("drops anything damaged or unknown", async () => {
    const wallet = await passkey.createPasskey(new SoftAuthenticator());
    const saved = JSON.parse(passkey.serializePasskeyWallet(wallet)) as Record<string, unknown>;
    for (const bad of [
      null,
      undefined,
      "",
      "not json",
      "null",
      "[]",
      JSON.stringify({ ...saved, v: 2 }),
      JSON.stringify({ ...saved, publicKey: "AAAA" }),
      JSON.stringify({ ...saved, publicKey: 7 }),
      JSON.stringify({ ...saved, credentialId: "" }),
      JSON.stringify({ ...saved, address: undefined }),
    ]) {
      expect(passkey.parsePasskeyWallet(bad)).toBeNull();
    }
  });
});

describe("signing", () => {
  const txBytes = new Uint8Array(64).map((_, i) => i);

  it("signs a transaction as the wallet, with the wallet's own passkey", async () => {
    const device = new SoftAuthenticator();
    await passkey.createPasskey(device);
    const wallet = await passkey.createPasskey(device);
    const signature = await passkey.signTransactionWithPasskey(wallet, device, txBytes);
    const key = await verifyTransactionSignature(txBytes, signature, { address: wallet.address });
    expect(key.toSuiAddress()).toBe(wallet.address);
    expect(Buffer.from(device.asked.at(-1)!.credentialId!).toString("base64url")).toBe(wallet.credentialId);
  });

  it("signs a message as the wallet", async () => {
    const device = new SoftAuthenticator();
    const wallet = await passkey.createPasskey(device);
    const message = new TextEncoder().encode("reef:cashout:list:0xabc::1");
    const signature = await passkey.signMessageWithPasskey(wallet, device, message);
    expect((await verifyPersonalMessageSignature(message, signature, { address: wallet.address })).toSuiAddress()).toBe(wallet.address);
  });

  it("refuses to hand back a signature made by a different passkey", async () => {
    const device = new SoftAuthenticator();
    const wallet = await passkey.createPasskey(device);
    await passkey.createPasskey(device);
    device.ignoreRequestedPasskey = true;
    device.pick = 1;
    await fails(passkey.signTransactionWithPasskey(wallet, device, txBytes), "different-passkey");
    await fails(passkey.signMessageWithPasskey(wallet, device, new Uint8Array([1, 2, 3])), "different-passkey");
  });
});

describe("networkVerifiesSignature", () => {
  it("sends transaction bytes as they are and reports the node's verdict", async () => {
    const node = fakeNode({ isValid: false, reason: "passkey challenge does not match expected message" });
    const bytes = new Uint8Array([9, 8, 7]);
    const out = await passkey.networkVerifiesSignature(node.client, { scope: "TransactionData", bytes, signature: "AAEC", address: "0x1" });
    expect(out).toEqual({ valid: false, reason: "passkey challenge does not match expected message" });
    expect(node.calls[0]).toMatchObject({ name: "TransactionData", address: "0x1" });
    expect([...node.calls[0]!.value!]).toEqual([9, 8, 7]);
    expect([...node.calls[0]!.signature!]).toEqual([0, 1, 2]);
  });
});

describe("describePasskeyError", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("words a closed prompt for what was being done", () => {
    expect(passkey.describePasskeyError(named("NotAllowedError"), "send").message).toContain("Nothing was sent");
    expect(passkey.describePasskeyError(named("NotAllowedError"), "swap").message).toContain("Nothing was swapped");
    expect(passkey.describePasskeyError(named("AbortError"), "create").message).toContain("no wallet was made");
    expect(passkey.describePasskeyError(named("NotAllowedError"), "confirm").message).toContain("Nothing was changed");
  });

  it("tells the other cases apart", () => {
    expect(passkey.describePasskeyError(named("SecurityError"), "send").code).toBe("wrong-site");
    expect(passkey.describePasskeyError(named("NotSupportedError"), "create").code).toBe("unsupported");
    expect(passkey.describePasskeyError(new PasskeyError("network", "offline"), "create")).toEqual({ code: "network", message: "offline" });
    for (const odd of [new Error("boom"), "boom", null, undefined, 42]) {
      expect(passkey.describePasskeyError(odd, "send").code).toBe("failed");
    }
  });
});
