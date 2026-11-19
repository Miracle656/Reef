/**
 * Recovery passkey records (#10). The chain (`AddressAliases`) decides who may
 * sign; this table remembers the WebAuthn credential id + public key so a new
 * device can find and use the passkey, plus a label for the settings list.
 */
import { PasskeyPublicKey } from "@mysten/sui/keypairs/passkey";
import { fromBase64, normalizeSuiAddress } from "@mysten/sui/utils";
import { canonicalPasskeyRecordBytes, type SignedPasskeyRecord } from "@umbra/core";
import type { PrismaClient } from "@prisma/client";
import { verifySignedBy } from "./signer";

const MAX_SKEW_MS = 10 * 60_000;

type Verify = (owner: string, bytes: Uint8Array, signature: string) => Promise<boolean>;

/** Why a record was refused, or null if it's acceptable. Pure apart from `verify`. */
export async function checkPasskeyRecord(
  signed: SignedPasskeyRecord,
  verify: Verify = verifySignedBy,
  now = Date.now(),
): Promise<string | null> {
  const m = signed.message;
  if (Math.abs(now - m.timestamp) > MAX_SKEW_MS) return "stale timestamp";
  try {
    const derived = new PasskeyPublicKey(fromBase64(m.publicKey)).toSuiAddress();
    if (derived !== normalizeSuiAddress(m.passkey)) return "public key doesn't match the passkey address";
  } catch {
    return "invalid passkey public key";
  }
  if (!(await verify(m.owner, canonicalPasskeyRecordBytes(m), signed.signature))) return "bad signature";
  return null;
}

/** Verify, then add or remove the record. */
export async function applyPasskeyRecord(prisma: PrismaClient, signed: SignedPasskeyRecord): Promise<{ ok: boolean; error?: string }> {
  const error = await checkPasskeyRecord(signed);
  if (error) return { ok: false, error };
  const m = signed.message;
  const owner = normalizeSuiAddress(m.owner);
  const passkey = normalizeSuiAddress(m.passkey);
  if (m.action === "remove") {
    await prisma.recoveryPasskey.deleteMany({ where: { owner, passkey } });
    return { ok: true };
  }
  await prisma.recoveryPasskey.upsert({
    where: { owner_passkey: { owner, passkey } },
    create: { owner, passkey, publicKey: m.publicKey, credentialId: m.credentialId, label: m.label, createdAtMs: BigInt(m.timestamp) },
    update: { publicKey: m.publicKey, credentialId: m.credentialId, label: m.label },
  });
  return { ok: true };
}
