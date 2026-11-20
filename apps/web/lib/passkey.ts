"use client";

/**
 * Browser passkeys. A passkey is a secp256r1 key in the device's secure
 * hardware (Face ID, fingerprint, Windows Hello), kept by its password manager.
 * ReeF uses them two ways:
 *   - the wallet-only app: the passkey IS the account (lib/passkey-wallet.ts)
 *   - the full app: an extra recovery key for a Google account (#10), added to
 *     the account's `address_alias` set so it can sign AS the account
 */
import { PasskeyKeypair, type PasskeyProvider } from "@mysten/sui/keypairs/passkey";
import { toBase64 } from "@mysten/sui/utils";
import { NETWORK, PASSKEY_RP_ID } from "./config";

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

/** The web address (WebAuthn relying-party id) passkeys are bound to. */
export function passkeyRpId(): string {
  return PASSKEY_RP_ID ?? window.location.hostname;
}

/** Passkeys only work on their RP id (and its subdomains): a preview deploy or
 *  localhost can't use production passkeys and vice versa. */
export function onPasskeyHost(): boolean {
  const rp = passkeyRpId();
  const host = window.location.hostname;
  return host === rp || host.endsWith(`.${rp}`);
}

export type PasskeyBlocker =
  /** this browser has no passkeys */
  | "unsupported"
  /** real money, and nobody has said which web address wallets belong to */
  | "no-site"
  /** wallets belong to another web address than the one this page is on */
  | "wrong-site";

/** Why a passkey can't be made or used on this page, or null when it can. */
export function passkeyBlocker(): PasskeyBlocker | null {
  if (!passkeysSupported()) return "unsupported";
  // A passkey is tied to its web address for good. With real money that address
  // has to be chosen on purpose (NEXT_PUBLIC_PASSKEY_RP_ID), never whatever host
  // a build happens to be served from.
  if (NETWORK === "mainnet" && !PASSKEY_RP_ID) return "no-site";
  if (!onPasskeyHost()) return "wrong-site";
  return null;
}

type Created = Awaited<ReturnType<PasskeyProvider["create"]>>;
type Asserted = Awaited<ReturnType<PasskeyProvider["get"]>>;

/** People set up a screen lock or reach for a second device mid-prompt: give them time. */
const PROMPT_TIMEOUT_MS = 120_000;

/**
 * The browser side of a ReeF passkey.
 *
 * The SDK ships a provider too, but it leaves `rpId` out when signing, so the
 * browser falls back to the page's own host and can't find a passkey that was
 * made for a parent address. This one always names the address.
 */
export class ReefPasskeyProvider implements PasskeyProvider {
  /** @param label what the password manager lists the passkey under */
  constructor(private readonly label: string) {}

  async create(): Promise<Created> {
    const credential = await navigator.credentials.create({
      publicKey: {
        rp: { name: "ReeF", id: passkeyRpId() },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: this.label, displayName: this.label },
        // Nothing checks a registration challenge: the account is the public key itself.
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        // ES256 (secp256r1) is the only curve Sui passkeys use.
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          // No `authenticatorAttachment`: the phone or laptop itself (Face ID,
          // fingerprint) and a security key are both fine.
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
        timeout: PROMPT_TIMEOUT_MS,
      },
    });
    if (!credential) throw new Error("No passkey was made");
    return credential as Created;
  }

  async get(challenge: Uint8Array, credentialId?: Uint8Array): Promise<Asserted> {
    const credential = await navigator.credentials.get({
      publicKey: {
        rpId: passkeyRpId(),
        challenge: challenge as BufferSource,
        userVerification: "required",
        timeout: PROMPT_TIMEOUT_MS,
        ...(credentialId ? { allowCredentials: [{ type: "public-key" as const, id: credentialId as BufferSource }] } : {}),
      },
    });
    if (!credential) throw new Error("No passkey answered");
    return credential as Asserted;
  }
}

export interface NewPasskey {
  /** the passkey's Sui address (what gets added as an alias) */
  address: string;
  /** base64 compressed secp256r1 public key */
  publicKey: string;
  /** base64url WebAuthn credential id */
  credentialId: string;
}

const base64url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Prompt for a new recovery passkey (Face ID / fingerprint / security key). */
export async function createRecoveryPasskey(userName: string): Promise<NewPasskey> {
  const keypair = await PasskeyKeypair.getPasskeyInstance(new ReefPasskeyProvider(userName));
  const credentialId = keypair.getCredentialId();
  return {
    address: keypair.toSuiAddress(),
    publicKey: toBase64(keypair.getPublicKey().toRawBytes()),
    credentialId: credentialId ? base64url(credentialId) : "",
  };
}

/** A short device name for the settings list ("iPhone", "Mac", …). */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Passkey";
}
