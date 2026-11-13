import { describe, expect, it } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { verifyPersonalMessageSignature, verifyTransactionSignature } from "@mysten/sui/verify";
import { softwarePasskey } from "../dev/software-passkey";

describe("software passkey (dev/test authenticator)", () => {
  it("signs transactions that verify as the passkey address", async () => {
    const passkey = softwarePasskey();
    const tx = new Transaction();
    tx.setSender(passkey.toSuiAddress());
    tx.setGasOwner("0x" + "5".repeat(64));
    tx.setGasPayment([]);
    tx.setGasBudget(10_000_000);
    tx.setGasPrice(1000);
    tx.setExpiration({
      ValidDuring: { minEpoch: "1", maxEpoch: "2", minTimestamp: null, maxTimestamp: null, chain: "1".repeat(32), nonce: 3 },
    });
    tx.moveCall({ target: `0x${"a".repeat(64)}::follow::create_follow_set` });
    const bytes = await tx.build();

    const { signature } = await passkey.signTransaction(bytes);
    const pk = await verifyTransactionSignature(bytes, signature);
    expect(passkey.getKeyScheme()).toBe("Passkey");
    expect(pk.toSuiAddress()).toBe(passkey.toSuiAddress());
  });

  it("signs personal messages (off-chain reactions/links) that verify", async () => {
    const passkey = softwarePasskey();
    const message = new TextEncoder().encode("reef:like:0xfeed");
    const { signature } = await passkey.signPersonalMessage(message);
    const pk = await verifyPersonalMessageSignature(message, signature);
    expect(pk.toSuiAddress()).toBe(passkey.toSuiAddress());
  });

  it("rejects a signature over different bytes", async () => {
    const passkey = softwarePasskey();
    const { signature } = await passkey.signPersonalMessage(new TextEncoder().encode("a"));
    await expect(verifyPersonalMessageSignature(new TextEncoder().encode("b"), signature)).rejects.toThrow();
  });
});
