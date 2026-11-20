/**
 * TEST ONLY. A software stand-in for the device's passkey store: it makes
 * P-256 keys in memory and answers WebAuthn requests the way a phone does (a
 * DER signature over `authenticatorData || sha256(clientDataJSON)`), so the
 * passkey wallet logic can be run in Node. Never use it for a real account.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import type { PasskeyProvider } from "@mysten/sui/keypairs/passkey";

type Created = Awaited<ReturnType<PasskeyProvider["create"]>>;
type Asserted = Awaited<ReturnType<PasskeyProvider["get"]>>;

interface SoftCredential {
  id: Uint8Array;
  privateKey: KeyObject;
  /** DER SubjectPublicKeyInfo, what `getPublicKey()` returns in a browser */
  spki: Uint8Array;
}

const sha256 = (data: Uint8Array | string) => new Uint8Array(createHash("sha256").update(data).digest());
const buffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** What a browser throws when the person closes the prompt. */
export const cancelled = () => Object.assign(new Error("The operation either timed out or was not allowed."), { name: "NotAllowedError" });

export class SoftAuthenticator implements PasskeyProvider {
  readonly credentials: SoftCredential[] = [];
  /** which passkey the "person" picks when the site doesn't name one */
  pick = 0;
  /** every signing request, in order */
  readonly asked: { challenge: Uint8Array; credentialId?: Uint8Array }[] = [];
  /** thrown by the next prompt, then cleared */
  failNext: unknown = null;
  /** answer with the picked passkey even when the site named another */
  ignoreRequestedPasskey = false;

  constructor(readonly origin = "https://wallet.example") {}

  #prompt() {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
  }

  async create(): Promise<Created> {
    this.#prompt();
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const credential: SoftCredential = {
      id: new Uint8Array(randomBytes(16)),
      privateKey,
      spki: new Uint8Array(publicKey.export({ format: "der", type: "spki" })),
    };
    this.credentials.push(credential);
    return { rawId: buffer(credential.id), response: { getPublicKey: () => buffer(credential.spki) } } as unknown as Created;
  }

  async get(challenge: Uint8Array, credentialId?: Uint8Array): Promise<Asserted> {
    this.asked.push({ challenge, credentialId });
    this.#prompt();
    const credential =
      credentialId && !this.ignoreRequestedPasskey ? this.credentials.find((c) => equal(c.id, credentialId)) : this.credentials[this.pick];
    if (!credential) throw cancelled();

    const authenticatorData = new Uint8Array([...sha256(new URL(this.origin).hostname), 0x05, 0, 0, 0, this.asked.length]);
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({ type: "webauthn.get", challenge: Buffer.from(challenge).toString("base64url"), origin: this.origin, crossOrigin: false }),
    );
    const signed = new Uint8Array([...authenticatorData, ...sha256(clientDataJSON)]);
    const signature = new Uint8Array(sign("sha256", signed, { key: credential.privateKey, dsaEncoding: "der" }));
    return {
      rawId: buffer(credential.id),
      response: { authenticatorData: buffer(authenticatorData), clientDataJSON: buffer(clientDataJSON), signature: buffer(signature) },
    } as unknown as Asserted;
  }
}
