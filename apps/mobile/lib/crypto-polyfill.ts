import { getRandomValues, randomUUID } from "expo-crypto";

/**
 * Hermes ships no Web Crypto, but @mysten/sui's Ed25519 keypair (via @noble)
 * calls `crypto.getRandomValues` and @mysten/enoki's client calls
 * `crypto.randomUUID`. Polyfill both from expo-crypto, which is bundled in
 * Expo Go (no custom dev build needed). Must be imported before any
 * @mysten/sui / @mysten/enoki code runs — see app/_layout.tsx (first import).
 */
const g = globalThis as unknown as { crypto?: { getRandomValues?: unknown; randomUUID?: unknown } };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g.crypto.getRandomValues = (array: any) => getRandomValues(array);
}
if (typeof g.crypto.randomUUID !== "function") {
  g.crypto.randomUUID = () => randomUUID();
}
