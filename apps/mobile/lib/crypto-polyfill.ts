import { getRandomValues, randomUUID } from "expo-crypto";
import { gcm } from "@noble/ciphers/aes.js";

/**
 * Hermes ships no Web Crypto, but @mysten/sui's Ed25519 keypair (via @noble)
 * calls `crypto.getRandomValues` and @mysten/enoki's client calls
 * `crypto.randomUUID`. Polyfill both from expo-crypto, which is bundled in
 * Expo Go (no custom dev build needed). Must be imported before any
 * @mysten/sui / @mysten/enoki code runs — see app/_layout.tsx (first import).
 *
 * The Sui Stack Messaging SDK + Seal additionally use `crypto.subtle`, but only
 * for **AES-256-GCM** (generateKey / exportKey("raw") / importKey("raw") /
 * encrypt / decrypt — verified against both packages' dist). We polyfill exactly
 * that surface in pure JS with @noble/ciphers, so E2EE chat runs in Expo Go.
 */

const g = globalThis as unknown as {
  crypto?: { getRandomValues?: unknown; randomUUID?: unknown; subtle?: unknown };
};
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g.crypto.getRandomValues = (array: any) => getRandomValues(array);
}
if (typeof g.crypto.randomUUID !== "function") {
  g.crypto.randomUUID = () => randomUUID();
}

// ── minimal SubtleCrypto: AES-GCM only ────────────────────────────────────────

/** Our stand-in for CryptoKey — just tagged raw bytes. */
interface NobleAesKey {
  __noble: true;
  raw: Uint8Array;
  algorithm: { name: "AES-GCM"; length: number };
  extractable: boolean;
  usages: string[];
  type: "secret";
}

function assertAesGcm(name: unknown): void {
  if (String(name).toUpperCase() !== "AES-GCM") {
    throw new Error(`crypto.subtle polyfill supports AES-GCM only (got ${String(name)})`);
  }
}

function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
}

/** Copy into a fresh ArrayBuffer (callers expect ArrayBuffer, not a view). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

const subtle = {
  async generateKey(
    algorithm: { name: string; length?: number },
    extractable: boolean,
    usages: string[],
  ): Promise<NobleAesKey> {
    assertAesGcm(algorithm.name);
    const length = algorithm.length ?? 256;
    const raw = new Uint8Array(length / 8);
    getRandomValues(raw);
    return { __noble: true, raw, algorithm: { name: "AES-GCM", length }, extractable, usages, type: "secret" };
  },

  async importKey(
    format: string,
    keyData: ArrayBuffer | ArrayBufferView,
    algorithm: { name: string } | string,
    extractable: boolean,
    usages: string[],
  ): Promise<NobleAesKey> {
    if (format !== "raw") throw new Error(`crypto.subtle polyfill supports importKey("raw") only (got ${format})`);
    assertAesGcm(typeof algorithm === "string" ? algorithm : algorithm.name);
    const raw = toBytes(keyData).slice();
    return { __noble: true, raw, algorithm: { name: "AES-GCM", length: raw.length * 8 }, extractable, usages, type: "secret" };
  },

  async exportKey(format: string, key: NobleAesKey): Promise<ArrayBuffer> {
    if (format !== "raw") throw new Error(`crypto.subtle polyfill supports exportKey("raw") only (got ${format})`);
    return toArrayBuffer(key.raw);
  },

  async encrypt(
    params: { name: string; iv: ArrayBuffer | ArrayBufferView; additionalData?: ArrayBuffer | ArrayBufferView },
    key: NobleAesKey,
    plaintext: ArrayBuffer | ArrayBufferView,
  ): Promise<ArrayBuffer> {
    assertAesGcm(params.name);
    const aad = params.additionalData ? toBytes(params.additionalData) : undefined;
    const out = gcm(key.raw, toBytes(params.iv), aad).encrypt(toBytes(plaintext));
    return toArrayBuffer(out);
  },

  async decrypt(
    params: { name: string; iv: ArrayBuffer | ArrayBufferView; additionalData?: ArrayBuffer | ArrayBufferView },
    key: NobleAesKey,
    ciphertext: ArrayBuffer | ArrayBufferView,
  ): Promise<ArrayBuffer> {
    assertAesGcm(params.name);
    const aad = params.additionalData ? toBytes(params.additionalData) : undefined;
    const out = gcm(key.raw, toBytes(params.iv), aad).decrypt(toBytes(ciphertext));
    return toArrayBuffer(out);
  },
};

if (!g.crypto.subtle) {
  g.crypto.subtle = subtle;
}
