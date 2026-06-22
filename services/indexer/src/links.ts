/**
 * Wallet linking: verify the external wallet's personal-message signature, then
 * record the verified link. Passing the Sui client lets us verify zkLogin
 * signatures (e.g. Slush "Sign in with Google" accounts), not just plain keys.
 */
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { canonicalWalletLinkBytes, type SignedWalletLink } from "@umbra/core";
import type { PrismaClient } from "@prisma/client";
import { suiClient } from "./sui";

/** True iff the signature is valid AND produced by `message.linked`. */
export async function verifyWalletLink(signed: SignedWalletLink): Promise<boolean> {
  try {
    const pk = await verifyPersonalMessageSignature(
      canonicalWalletLinkBytes(signed.message),
      signed.signature,
      { client: suiClient, address: signed.message.linked },
    );
    const recovered = pk.toSuiAddress();
    if (recovered !== signed.message.linked) {
      console.warn(`[link] address mismatch: signed by ${recovered}, claimed ${signed.message.linked}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[link] verify error:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Verify then store the link. Returns false if the signature is invalid. */
export async function applyWalletLink(prisma: PrismaClient, signed: SignedWalletLink): Promise<boolean> {
  if (!(await verifyWalletLink(signed))) return false;
  const { owner, linked } = signed.message;
  await prisma.linkedAddress.upsert({
    where: { owner_linked: { owner, linked } },
    create: { owner, linked, createdAtMs: BigInt(Date.now()) },
    update: {},
  });
  return true;
}
