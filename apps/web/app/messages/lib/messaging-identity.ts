/**
 * ── MESSAGING DELEGATE KEYPAIR (the relayer-auth identity) ───────────────────
 *
 * WHY: the Sui Stack Messaging relayer authenticates every request with a raw
 * keypair signature (Ed25519/Secp256k1/Secp256r1) and checks pubkey→address ==
 * sender. A zkLogin/Enoki signature can't satisfy this — its public key doesn't
 * derive the zkLogin address — so the relayer returns 401. (Confirmed at runtime.)
 *
 * FIX (deepmarket's pattern): each signed-in user gets a dedicated Ed25519
 * "delegate" keypair that:
 *   - signs all relayer/message ops + the Seal session key (valid keypair sig),
 *   - is the on-chain group member + message sender the relayer sees,
 *   - has its group txs (create/grant) Enoki-sponsored, so it stays gasless even
 *     though it holds no SUI.
 *
 * The user's zkLogin address still sponsors gas and is granted group membership
 * for cross-device discovery; the delegate is the messaging actor beneath it.
 *
 * PERSISTENCE (testnet): the secret is stored per-device in localStorage, keyed
 * by the owner's zkLogin address. Cross-device recovery (Seal-encrypt the secret
 * to the zkLogin address) is deferred.
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const PREFIX = "reef:msg-delegate:v1:";
const cache = new Map<string, Ed25519Keypair>();

function keyOf(owner: string): string {
  return PREFIX + owner.toLowerCase();
}

function persist(owner: string, kp: Ed25519Keypair): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyOf(owner), kp.getSecretKey());
  } catch {
    /* private mode / quota — delegate becomes ephemeral this session */
  }
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
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(keyOf(owner)) : null;
  if (raw) {
    try {
      kp = Ed25519Keypair.fromSecretKey(raw);
    } catch {
      kp = Ed25519Keypair.generate();
      persist(owner, kp);
    }
  } else {
    kp = Ed25519Keypair.generate();
    persist(owner, kp);
  }
  cache.set(k, kp);
  return kp;
}

/** The delegate's Sui address for an owner — what the relayer sees as sender. */
export function getDelegateAddress(owner: string): string {
  return getDelegateKeypair(owner).toSuiAddress();
}
