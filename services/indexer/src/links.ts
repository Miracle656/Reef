/**
 * Wallet linking: verify the external wallet's personal-message signature, then
 * record the verified link. Same verification path as reactions (see D-2).
 */
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { canonicalWalletLinkBytes, type SignedWalletLink } from "@umbra/core";
import type { PrismaClient } from "@prisma/client";

/** True iff the signature is valid AND produced by `message.linked`. */
export async function verifyWalletLink(signed: SignedWalletLink): Promise<boolean> {
  try {
    const pk = await verifyPersonalMessageSignature(
      canonicalWalletLinkBytes(signed.message),
      signed.signature,
    );
    return pk.toSuiAddress() === signed.message.linked;
  } catch {
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
