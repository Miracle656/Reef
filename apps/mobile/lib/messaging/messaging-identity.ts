/**
 * ── MESSAGING DELEGATE KEYPAIR (the relayer-auth identity) ───────────────────
 *
 * Mirror of web app/messages/lib/messaging-identity.ts. The relayer
 * authenticates every request with a raw keypair signature and checks
 * pubkey→address == sender; zkLogin can't satisfy that, so each signed-in user
 * gets a per-device Ed25519 "delegate" keypair that signs all relayer/message
 * ops + the Seal session key. Its group txs are Enoki-sponsored.
 *
 * PERSISTENCE (testnet): the secret is stored per-device in the messaging KV
 * file, keyed by the owner's zkLogin address.
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { kv } from "./kv";

const PREFIX = "reef:msg-delegate:v1:";
const cache = new Map<string, Ed25519Keypair>();

function keyOf(owner: string): string {
  return PREFIX + owner.toLowerCase();
}

/**
 * Get (or lazily create + persist) this device's delegate keypair for the given
 * zkLogin owner. An `Ed25519Keypair` implements `@mysten/sui`'s `Signer`, so it
 * drops straight into every Sui Stack Messaging SDK call.
 */
export function getDelegateKeypair(owner: string): Ed25519Keypair {
  const k = owner.toLowerCase();
  const cached = cache.get(k);
  if (cached) return cached;

  let kp: Ed25519Keypair;
  const raw = kv.getItem(keyOf(owner));
  if (raw) {
    try {
      kp = Ed25519Keypair.fromSecretKey(raw);
    } catch {
      kp = Ed25519Keypair.generate();
      kv.setItem(keyOf(owner), kp.getSecretKey());
    }
  } else {
    kp = Ed25519Keypair.generate();
    kv.setItem(keyOf(owner), kp.getSecretKey());
  }
  cache.set(k, kp);
  return kp;
}

/** The delegate's Sui address for an owner — what the relayer sees as sender. */
export function getDelegateAddress(owner: string): string {
  return getDelegateKeypair(owner).toSuiAddress();
}
