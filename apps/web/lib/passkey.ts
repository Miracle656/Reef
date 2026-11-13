"use client";

/**
 * Browser passkeys for account recovery (#10). A passkey is a secp256r1 key in
 * the device's secure hardware (Face ID, fingerprint, Windows Hello); added to
 * the account's `address_alias` set it can sign AS the account.
 */
import { BrowserPasskeyProvider, PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { toBase64 } from "@mysten/sui/utils";
import { PASSKEY_RP_ID } from "./config";

export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

/** The WebAuthn relying-party id passkeys are bound to. */
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

export interface NewPasskey {
  /** the passkey's Sui address (what gets added as an alias) */
  address: string;
  /** base64 compressed secp256r1 public key */
  publicKey: string;
  /** base64url WebAuthn credential id */
  credentialId: string;
}

const base64url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Prompt for a new passkey (Face ID / fingerprint / security key). */
export async function createRecoveryPasskey(userName: string): Promise<NewPasskey> {
  const provider = new BrowserPasskeyProvider("ReeF", {
    rp: { name: "ReeF", id: passkeyRpId() },
    user: { name: userName, displayName: userName },
    authenticatorSelection: {
      // The SDK defaults to "cross-platform", which hides Face ID / Touch ID.
      authenticatorAttachment: undefined,
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
  });
  const keypair = await PasskeyKeypair.getPasskeyInstance(provider);
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
