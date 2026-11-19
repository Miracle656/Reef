/**
 * Off-chain reactions: verify the Sui personal-message signature, then upsert.
 * No on-chain write in Phase 1 — the `post_id` is stable so these could be
 * settled on-chain later (see CLAUDE.md D-2).
 */
import { canonicalReactionBytes, type SignedReaction } from "@umbra/core";
import type { PrismaClient } from "@prisma/client";
import { verifySignedBy } from "./signer";

/** True iff the signature is valid AND its signer may act as `message.reactor`
 *  (the reactor's own key, or a key in its address_alias set, see signer.ts). */
export async function verifyReaction(signed: SignedReaction): Promise<boolean> {
  return verifySignedBy(signed.message.reactor, canonicalReactionBytes(signed.message), signed.signature);
}

/** Verify then record a reaction (latest intent wins). Returns false if invalid. */
export async function applyReaction(prisma: PrismaClient, signed: SignedReaction): Promise<boolean> {
  if (!(await verifyReaction(signed))) return false;
  const m = signed.message;
  await prisma.reaction.upsert({
    where: { postId_reactor_kind: { postId: m.postId, reactor: m.reactor, kind: m.kind } },
    create: { postId: m.postId, reactor: m.reactor, kind: m.kind, value: m.value, timestamp: BigInt(m.timestamp) },
    update: { value: m.value, timestamp: BigInt(m.timestamp) },
  });
  return true;
}
