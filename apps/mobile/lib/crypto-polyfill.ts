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
  Intl?: { PluralRules?: unknown };
};

// Hermes ships Intl but not Intl.PluralRules, and @mysten/sui's client/utils.mjs
// constructs one at module scope (for "1st/2nd/3rd command" in error messages) —
// without this shim the whole messaging client fails to import. English-only
// rules are all the SDK needs.
if (g.Intl && typeof g.Intl.PluralRules === "undefined") {
  class PluralRulesShim {
    #type: string;
    constructor(_locales?: unknown, options?: { type?: string }) {
      this.#type = options?.type === "ordinal" ? "ordinal" : "cardinal";
    }
    select(n: number): "one" | "two" | "few" | "other" {
      if (this.#type === "ordinal") {
        const rem10 = Math.abs(n) % 10;
        const rem100 = Math.abs(n) % 100;
        if (rem10 === 1 && rem100 !== 11) return "one";
        if (rem10 === 2 && rem100 !== 12) return "two";
        if (rem10 === 3 && rem100 !== 13) return "few";
        return "other";
      }
      return n === 1 ? "one" : "other";
    }
    resolvedOptions() {
      return { locale: "en-US", type: this.#type };
    }
    static supportedLocalesOf() {
      return ["en-US"];
    }
  }
  g.Intl.PluralRules = PluralRulesShim;
}
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g.crypto.getRandomValues = (array: any) => getRandomValues(array);
}
if (typeof g.crypto.randomUUID !== "function") {
  g.crypto.randomUUID = () => randomUUID();
}

// Hermes has AbortController/AbortSignal but not the static helpers the Mysten
// SDKs use for request timeouts (relayer fetches, RPC): AbortSignal.timeout and
// AbortSignal.any. Both are small compositions over AbortController.
{
  const AS = (globalThis as { AbortSignal?: unknown }).AbortSignal as
    | { timeout?: unknown; any?: unknown }
    | undefined;
  if (AS && typeof AS.timeout !== "function") {
    AS.timeout = (ms: number) => {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(new Error(`TimeoutError: signal timed out after ${ms}ms`)), ms);
      return ctrl.signal;
    };
  }
  if (AS && typeof AS.any !== "function") {
    AS.any = (signals: AbortSignal[]) => {
      const ctrl = new AbortController();
      for (const s of signals) {
        if (s.aborted) {
          ctrl.abort((s as { reason?: unknown }).reason ?? new Error("aborted"));
          break;
        }
        s.addEventListener("abort", () => ctrl.abort((s as { reason?: unknown }).reason ?? new Error("aborted")), {
          once: true,
        });
      }
      return ctrl.signal;
    };
  }
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
