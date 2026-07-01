/**
 * ── ENOKI → Signer BRIDGE ────────────────────────────────────────────────────
 *
 * The Sui Stack Messaging SDK takes a `Signer` for message signing, relayer auth,
 * and Seal session keys. It never calls `sign()` (raw bytes) — the transport signs
 * via `signPersonalMessage()`. So we wrap ReeF's Enoki (zkLogin) wallet as a
 * `Signer` whose only real capability is `signPersonalMessage`, mirroring Mysten's
 * own `DappKitSigner` reference (chat-app/src/lib/dapp-kit-signer.ts), which is
 * documented to support "Ed25519, Secp256k1, Secp256r1, zkLogin, multisig".
 *
 * This keeps the on-chain messaging identity the user's REAL zkLogin address — no
 * separate device keypair — so senders map cleanly to social profiles.
 *
 * `signPersonalMessageFn` is the imperative signer from `useEnokiSignPersonalMessage()`
 * (which routes to the Enoki wallet directly, not dapp-kit's "current" wallet).
 *
 * KNOWN RUNTIME UNKNOWN: the SDK's per-message sender signature
 * (`verification.signMessageContent`) parses the returned signature and extracts a
 * raw keypair component; a pure zkLogin signature may leave `senderVerified=false`.
 * That does not block send/receive (the reference lists zkLogin as supported), but
 * verify it once a relayer is live. If it proves fatal, the fallback is a dedicated
 * per-user Ed25519 messaging keypair (Enoki-sponsored txs, mapped to the profile).
 */

import { Signer, parseSerializedSignature } from "@mysten/sui/cryptography";
import type { PublicKey, SignatureScheme } from "@mysten/sui/cryptography";
import { publicKeyFromRawBytes, publicKeyFromSuiBytes } from "@mysten/sui/verify";
import { toBase64 } from "@mysten/sui/utils";

export type SignPersonalMessageFn = (message: Uint8Array) => Promise<{ signature: string }>;

export class EnokiSigner extends Signer {
  readonly #address: string;
  #publicKey: PublicKey | null;
  readonly #signPersonalMessage: SignPersonalMessageFn;
  /** Serializes signs — the Seal session-key ceremony and relayer-auth signing can
   *  overlap, and the Enoki wallet (like the reference dev-wallet) rejects a second
   *  concurrent sign. Mirrors chat-app/src/lib/queued-signer.ts. */
  #chain: Promise<unknown> = Promise.resolve();

  constructor(opts: {
    address: string;
    /** zkLogin/Enoki account public-key bytes, when the wallet exposes them. */
    publicKeyBytes?: Uint8Array;
    signPersonalMessage: SignPersonalMessageFn;
  }) {
    super();
    this.#address = opts.address;
    this.#publicKey = opts.publicKeyBytes?.length ? publicKeyFromSuiBytes(opts.publicKeyBytes) : null;
    this.#signPersonalMessage = opts.signPersonalMessage;
  }

  async sign(_bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    throw new Error("EnokiSigner.sign() is not supported. The messaging SDK uses signPersonalMessage().");
  }

  override async signPersonalMessage(bytes: Uint8Array): Promise<{ bytes: string; signature: string }> {
    const run = this.#chain.then(() => this.#signPersonalMessage(bytes));
    this.#chain = run.catch(() => undefined);
    const { signature } = await run;

    // Lazily resolve the public key from the first signature (zkLogin/wallets that
    // don't expose it upfront).
    if (!this.#publicKey) {
      const parsed = parseSerializedSignature(signature);
      if ("publicKey" in parsed && parsed.publicKey) {
        this.#publicKey = publicKeyFromRawBytes(parsed.signatureScheme, parsed.publicKey);
      }
    }

    return { bytes: toBase64(bytes), signature };
  }

  getKeyScheme(): SignatureScheme {
    if (!this.#publicKey) return "ED25519"; // default until first signature resolves it
    const flag = this.#publicKey.flag();
    if (flag === 0x00) return "ED25519";
    if (flag === 0x01) return "Secp256k1";
    return "Secp256r1";
  }

  getPublicKey(): PublicKey {
    if (!this.#publicKey) {
      throw new Error("Public key not yet available — it resolves after the first signPersonalMessage call.");
    }
    return this.#publicKey;
  }

  override toSuiAddress(): string {
    return this.#address;
  }
}
