/**
 * DEV/TEST ONLY. A software WebAuthn authenticator so passkey (secp256r1)
 * senders can be exercised from Node: smoke tests, unit tests, scripts. It
 * produces the same signature shape a phone's passkey does — DER ECDSA P-256
 * over `authenticatorData || sha256(clientDataJSON)`, with the Sui intent digest
 * as the WebAuthn challenge — so Sui validators and `@mysten/sui/verify`
 * accept it. Never use it for real accounts: the private key sits in memory.
 */
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { PasskeyKeypair, type PasskeyProvider } from "@mysten/sui/keypairs/passkey";

const sha256 = (data: Uint8Array | string) => new Uint8Array(createHash("sha256").update(data).digest());

const toArrayBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

const base64url = (u: Uint8Array) => Buffer.from(u).toString("base64url");

export class SoftwarePasskeyProvider implements PasskeyProvider {
  /** compressed secp256r1 public key (33 bytes), what PasskeyKeypair expects */
  readonly publicKey: Uint8Array;
  readonly #privateKey: KeyObject;
  #signCount = 0;

  constructor(readonly origin = "https://reef-web-one.vercel.app") {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.#privateKey = privateKey;
    const jwk = publicKey.export({ format: "jwk" });
    const x = Buffer.from(jwk.x!, "base64url");
    const y = Buffer.from(jwk.y!, "base64url");
    this.publicKey = new Uint8Array([y[y.length - 1]! & 1 ? 0x03 : 0x02, ...x]);
  }

  /** Registration isn't needed: build the keypair with {@link softwarePasskey}. */
  async create(): Promise<never> {
    throw new Error("SoftwarePasskeyProvider: construct PasskeyKeypair with provider.publicKey instead");
  }

  async get(challenge: Uint8Array): ReturnType<PasskeyProvider["get"]> {
    const rpIdHash = sha256(new URL(this.origin).hostname);
    const flags = 0x05; // user present + user verified
    const count = ++this.#signCount;
    const authenticatorData = new Uint8Array([...rpIdHash, flags, (count >>> 24) & 255, (count >>> 16) & 255, (count >>> 8) & 255, count & 255]);
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({ type: "webauthn.get", challenge: base64url(challenge), origin: this.origin, crossOrigin: false }),
    );
    const signed = new Uint8Array([...authenticatorData, ...sha256(clientDataJSON)]);
    const signature = new Uint8Array(sign("sha256", signed, { key: this.#privateKey, dsaEncoding: "der" }));
    return {
      response: {
        authenticatorData: toArrayBuffer(authenticatorData),
        clientDataJSON: toArrayBuffer(clientDataJSON),
        signature: toArrayBuffer(signature),
      },
    } as unknown as Awaited<ReturnType<PasskeyProvider["get"]>>;
  }
}

/** A ready-to-use passkey signer backed by a fresh software authenticator. */
export function softwarePasskey(origin?: string): PasskeyKeypair {
  const provider = new SoftwarePasskeyProvider(origin);
  return new PasskeyKeypair(provider.publicKey, provider);
}
