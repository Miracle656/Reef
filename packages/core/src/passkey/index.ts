/**
 * Passkey wallets.
 *
 * On the wallet-only app the account IS a passkey: a secp256r1 key that lives
 * in the user's phone or computer (Face ID, fingerprint, screen lock) and is
 * kept by their password manager. Its public key gives the Sui address, and the
 * passkey signs every transaction. There is no server account and no Enoki,
 * and nothing the app remembers about a wallet is secret.
 *
 * This module holds the parts that need no browser, so they are unit-tested:
 * what the app remembers, making a wallet, finding one again, and proving a
 * passkey can really sign before any money is sent to its address. The WebAuthn
 * calls themselves sit behind the SDK's `PasskeyProvider`.
 */
import { bcs } from "@mysten/sui/bcs";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { PasskeyKeypair, PasskeyPublicKey, findCommonPublicKey, type PasskeyProvider } from "@mysten/sui/keypairs/passkey";
import { fromBase64, toBase64 } from "@mysten/sui/utils";

export type { PasskeyProvider };

/** What the app remembers about a passkey wallet. None of it is secret. */
export interface PasskeyWallet {
  /** the wallet's Sui address, derived from `publicKey` */
  address: string;
  /** base64 of the passkey's compressed secp256r1 public key (33 bytes) */
  publicKey: string;
  /** base64url WebAuthn credential id: which passkey to ask for when signing */
  credentialId: string;
}

export type PasskeyErrorCode =
  /** the prompt was closed, timed out, or the device had no passkey to offer */
  | "cancelled"
  /** this browser or device can't do passkeys */
  | "unsupported"
  /** passkeys for this wallet belong to a different web address */
  | "wrong-site"
  /** a different passkey answered than the one the wallet belongs to */
  | "different-passkey"
  /** the passkey's signature didn't check out, so the wallet must not be used */
  | "not-confirmed"
  /** the Sui network couldn't be reached to check a signature */
  | "network"
  | "failed";

export class PasskeyError extends Error {
  constructor(
    readonly code: PasskeyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PasskeyError";
  }
}

const toBase64Url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text: string) => fromBase64(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

const publicKeyOf = (wallet: PasskeyWallet) => new PasskeyPublicKey(fromBase64(wallet.publicKey));

export function passkeyWalletFrom(publicKey: Uint8Array, credentialId: Uint8Array): PasskeyWallet {
  if (credentialId.length === 0) throw new PasskeyError("failed", "The passkey didn't come with an id.");
  // PasskeyPublicKey refuses anything that isn't a 33-byte key.
  return { address: new PasskeyPublicKey(publicKey).toSuiAddress(), publicKey: toBase64(publicKey), credentialId: toBase64Url(credentialId) };
}

// ---- what the app remembers ---------------------------------------------------

export function serializePasskeyWallet(wallet: PasskeyWallet): string {
  return JSON.stringify({ v: 1, address: wallet.address, publicKey: wallet.publicKey, credentialId: wallet.credentialId });
}

/**
 * Read a remembered wallet back. The address is worked out again from the
 * public key and must match what was saved: a damaged or edited record is
 * dropped (the person signs in with their passkey again) rather than shown as
 * an address to receive money at.
 */
export function parsePasskeyWallet(raw: string | null | undefined): PasskeyWallet | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { v?: unknown; address?: unknown; publicKey?: unknown; credentialId?: unknown } | null;
    if (!saved || saved.v !== 1) return null;
    if (typeof saved.address !== "string" || typeof saved.publicKey !== "string" || typeof saved.credentialId !== "string") return null;
    const wallet = passkeyWalletFrom(fromBase64(saved.publicKey), fromBase64Url(saved.credentialId));
    return wallet.address === saved.address ? wallet : null;
  } catch {
    return null;
  }
}

// ---- signing --------------------------------------------------------------------

/** The signer for a wallet. Every signature asks the device for this wallet's own passkey. */
export function passkeySigner(wallet: PasskeyWallet, provider: PasskeyProvider): PasskeyKeypair {
  return new PasskeyKeypair(fromBase64(wallet.publicKey), provider, fromBase64Url(wallet.credentialId));
}

const NOT_THIS_WALLET = "That passkey doesn't belong to this wallet. Nothing was signed.";

/**
 * Sign transaction bytes with the wallet's passkey (one prompt). The signature
 * is checked against the wallet's key before it is handed back, so a passkey
 * that isn't this wallet's is reported plainly instead of failing on the network.
 */
export async function signTransactionWithPasskey(wallet: PasskeyWallet, provider: PasskeyProvider, bytes: Uint8Array): Promise<string> {
  const { signature } = await passkeySigner(wallet, provider).signTransaction(bytes);
  const ok = await publicKeyOf(wallet)
    .verifyTransaction(bytes, signature)
    .catch(() => false);
  if (!ok) throw new PasskeyError("different-passkey", NOT_THIS_WALLET);
  return signature;
}

/** Sign a personal message with the wallet's passkey (one prompt), checked the same way. */
export async function signMessageWithPasskey(wallet: PasskeyWallet, provider: PasskeyProvider, message: Uint8Array): Promise<string> {
  const { signature } = await passkeySigner(wallet, provider).signPersonalMessage(message);
  const ok = await publicKeyOf(wallet)
    .verifyPersonalMessage(message, signature)
    .catch(() => false);
  if (!ok) throw new PasskeyError("different-passkey", NOT_THIS_WALLET);
  return signature;
}

// ---- making a wallet --------------------------------------------------------------

/**
 * Step 1 of making a wallet: ask the device for a brand-new passkey (one
 * prompt). The wallet must not be used, or shown as somewhere to receive
 * money, until {@link confirmPasskey} has passed.
 */
export async function createPasskey(provider: PasskeyProvider): Promise<PasskeyWallet> {
  const keypair = await PasskeyKeypair.getPasskeyInstance(provider);
  const credentialId = keypair.getCredentialId();
  if (!credentialId) throw new PasskeyError("failed", "The passkey didn't come with an id.");
  return passkeyWalletFrom(keypair.getPublicKey().toRawBytes(), credentialId);
}

/** What a new passkey signs to prove it works. Fixed text that authorises nothing. */
export const PASSKEY_CHECK_MESSAGE = new TextEncoder().encode("ReeF wallet check: this passkey can sign for this wallet.");

/** Step 2: sign the check message with the new passkey (one prompt). */
export async function signPasskeyCheck(wallet: PasskeyWallet, provider: PasskeyProvider): Promise<string> {
  const { signature } = await passkeySigner(wallet, provider).signPersonalMessage(PASSKEY_CHECK_MESSAGE);
  return signature;
}

type SignatureChecker = Pick<SuiGrpcClient, "signatureVerificationService">;

/**
 * Ask a Sui node whether `signature` is valid for `bytes` and belongs to
 * `address`. This is the network's own verdict, by the same code that checks a
 * real transaction, and it costs nothing and moves nothing.
 */
export async function networkVerifiesSignature(
  client: SignatureChecker,
  input: { scope: "PersonalMessage" | "TransactionData"; bytes: Uint8Array; signature: string; address: string },
): Promise<{ valid: boolean; reason: string }> {
  // A personal message is BCS-wrapped (a length-prefixed byte vector) before it is signed.
  const value = input.scope === "PersonalMessage" ? bcs.byteVector().serialize(input.bytes).toBytes() : input.bytes;
  const { response } = await client.signatureVerificationService.verifySignature({
    message: { name: input.scope, value },
    signature: { bcs: { value: fromBase64(input.signature) }, signature: { oneofKind: undefined } },
    address: input.address,
    jwks: [],
  });
  return { valid: response.isValid === true, reason: response.reason ?? "" };
}

/**
 * Step 3: make sure the check signature really is this wallet's, first here and
 * then by asking the network. A browser or password manager that hands back a
 * key it can't sign with, or a signature the network won't take, is caught
 * before a single dollar is sent to the address. Throws {@link PasskeyError}.
 *
 * The signature can be checked again without another prompt, so a network
 * hiccup ("network") only needs this call repeated.
 */
export async function confirmPasskey(client: SignatureChecker, wallet: PasskeyWallet, signature: string): Promise<void> {
  const notConfirmed = () =>
    new PasskeyError("not-confirmed", "We couldn't confirm that passkey works, so the wallet wasn't set up. No money is at risk. Try again.");
  const local = await publicKeyOf(wallet)
    .verifyPersonalMessage(PASSKEY_CHECK_MESSAGE, signature)
    .catch(() => false);
  if (!local) throw notConfirmed();

  let answer: { valid: boolean; reason: string };
  try {
    answer = await networkVerifiesSignature(client, { scope: "PersonalMessage", bytes: PASSKEY_CHECK_MESSAGE, signature, address: wallet.address });
  } catch {
    throw new PasskeyError("network", "Couldn't reach the Sui network to check your passkey. Check your connection and try again.");
  }
  if (!answer.valid) throw notConfirmed();
}

// ---- finding a wallet again ---------------------------------------------------------

export interface PasskeySearch {
  /** First prompt: the person picks their passkey. */
  first(): Promise<void>;
  /** Second prompt, limited to that same passkey. Gives back the wallet. */
  second(): Promise<PasskeyWallet>;
}

const randomChallenge = () => globalThis.crypto.getRandomValues(new Uint8Array(32));

/**
 * Find the wallet of a passkey the device already has, with nothing stored
 * anywhere.
 *
 * A passkey never hands its public key out again after it is made, so the key
 * is worked back from signatures. One signature fits two possible keys; a
 * second signature, from the same passkey over a different challenge, leaves
 * exactly one. That is why this takes two prompts. The challenges are random
 * bytes, so these signatures authorise nothing.
 */
export function findPasskey(provider: PasskeyProvider, challenge: () => Uint8Array = randomChallenge): PasskeySearch {
  let lastUsed: Uint8Array | null = null;
  let chosen: { id: Uint8Array; keys: ReturnType<typeof findCommonPublicKey>[] } | null = null;

  // The SDK's recovery call doesn't say which passkey answered, and we need it:
  // to hold the second prompt to the same one, and to ask for it when signing later.
  const watching: PasskeyProvider = {
    create: () => provider.create(),
    async get(bytes, credentialId) {
      const credential = await provider.get(bytes, credentialId ?? chosen?.id);
      // `rawId` is a DOM type this package doesn't load (it also runs outside browsers).
      lastUsed = new Uint8Array((credential as unknown as { rawId: ArrayBuffer }).rawId);
      return credential;
    },
  };

  return {
    async first() {
      chosen = null;
      lastUsed = null;
      const keys = await PasskeyKeypair.signAndRecover(watching, challenge());
      const id = lastUsed as Uint8Array | null;
      if (!id || id.length === 0) throw new PasskeyError("failed", "The passkey didn't come with an id.");
      chosen = { id, keys };
    },
    async second() {
      if (!chosen) throw new Error("findPasskey: call first() before second()");
      const { id, keys } = chosen;
      const again = await PasskeyKeypair.signAndRecover(watching, challenge());
      const different = () => new PasskeyError("different-passkey", "Use the same passkey both times. Start again and pick the same one twice.");
      const answered = lastUsed as Uint8Array | null;
      if (!answered || !sameBytes(answered, id)) throw different();
      let key: ReturnType<typeof findCommonPublicKey>;
      try {
        key = findCommonPublicKey(keys, again);
      } catch {
        throw different();
      }
      return passkeyWalletFrom(key.toRawBytes(), id);
    },
  };
}

// ---- errors, in words ---------------------------------------------------------------

/** What was being done when a passkey step failed (it changes the wording). */
export type PasskeyStep = "create" | "check" | "find" | "send" | "swap" | "confirm";

const CLOSED: Record<PasskeyStep, string> = {
  create: "The passkey prompt was closed before it finished, so no wallet was made.",
  check: "The passkey prompt was closed before the check finished. Try again.",
  find: "The passkey prompt was closed, or this device has no ReeF passkey. If your wallet lives on another phone or computer, open ReeF there.",
  send: "The passkey prompt was closed before it finished. Nothing was sent.",
  swap: "The passkey prompt was closed before it finished. Nothing was swapped.",
  confirm: "The passkey prompt was closed before it finished. Nothing was changed.",
};

/** Turn anything a passkey step can throw into a code and a sentence for the screen. */
export function describePasskeyError(e: unknown, step: PasskeyStep): { code: PasskeyErrorCode; message: string } {
  if (e instanceof PasskeyError) return { code: e.code, message: e.message };
  // WebAuthn reports failures as DOMExceptions, told apart by name.
  const name = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "AbortError":
      return { code: "cancelled", message: CLOSED[step] };
    case "SecurityError":
      return { code: "wrong-site", message: "Passkeys for this wallet don't work on this web address." };
    case "NotSupportedError":
      return { code: "unsupported", message: "This device can't make the kind of passkey ReeF needs. Try a phone or computer with a screen lock." };
    default:
      return { code: "failed", message: "The passkey step didn't work. Try again." };
  }
}
