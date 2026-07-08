/**
 * Stories / status: 24h ephemeral broadcast posts. Like reactions, these are
 * off-chain but signature-verified — the owner signs a canonical status
 * message with their zkLogin key, so nobody can post (or delete) as you.
 */
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import {
  canonicalStatusBytes,
  canonicalStatusDeleteBytes,
  type SignedStatus,
  type SignedStatusDelete,
} from "@umbra/core";
import type { PrismaClient } from "@prisma/client";
import { suiClient } from "./sui";

export const STATUS_TTL_MS = 24 * 3_600_000;

async function verifyBy(owner: string, bytes: Uint8Array, signature: string): Promise<boolean> {
  try {
    const pk = await verifyPersonalMessageSignature(bytes, signature, { client: suiClient, address: owner });
    return pk.toSuiAddress() === owner;
  } catch {
    return false;
  }
}

/** Verify then store a story. Returns the new status id, or null if invalid. */
export async function applyStatus(prisma: PrismaClient, signed: SignedStatus): Promise<string | null> {
  const m = signed.message;
  if (!(await verifyBy(m.owner, canonicalStatusBytes(m), signed.signature))) return null;
  // bound replay: the signed timestamp must be near "now"
  if (Math.abs(Date.now() - m.timestamp) > 10 * 60_000) return null;
  const row = await prisma.status.create({
    data: {
      owner: m.owner,
      type: m.type,
      content: m.content,
      mediaBlobId: m.mediaBlobId ?? null,
      bg: m.bg ?? null,
      createdAtMs: BigInt(m.timestamp),
    },
  });
  // opportunistic prune of expired stories (25h keeps a grace buffer)
  await prisma.status.deleteMany({ where: { createdAtMs: { lt: BigInt(Date.now() - STATUS_TTL_MS - 3_600_000) } } });
  return row.id;
}

/** Verify then delete one of the owner's stories. */
export async function applyStatusDelete(prisma: PrismaClient, signed: SignedStatusDelete): Promise<boolean> {
  const m = signed.message;
  if (!(await verifyBy(m.owner, canonicalStatusDeleteBytes(m), signed.signature))) return false;
  await prisma.status.deleteMany({ where: { id: m.statusId, owner: m.owner } });
  return true;
}
