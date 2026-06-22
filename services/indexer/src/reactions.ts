/**
 * Off-chain reactions: verify the Sui personal-message signature, then upsert.
 * No on-chain write in Phase 1 — the `post_id` is stable so these could be
 * settled on-chain later (see CLAUDE.md D-2).
 */
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { canonicalReactionBytes, type SignedReaction } from "@umbra/core";
import type { PrismaClient } from "@prisma/client";
import { suiClient } from "./sui";

/** True iff the signature is valid AND was produced by `message.reactor`. */
export async function verifyReaction(signed: SignedReaction): Promise<boolean> {
  try {
    const pk = await verifyPersonalMessageSignature(canonicalReactionBytes(signed.message), signed.signature, {
      client: suiClient,
      address: signed.message.reactor,
    });
    return pk.toSuiAddress() === signed.message.reactor;
  } catch {
    return false;
  }
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
