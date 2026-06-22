import { EnokiFlow } from "@mysten/enoki";
import { ENOKI_PUBLIC_API_KEY } from "./config";

/**
 * In-memory session store for EnokiFlow. (SecureStore can't hold Enoki's key
 * names, which contain "@" and "/"; an AsyncStorage adapter can be swapped in
 * later for persistence across app restarts.)
 */
function createMemoryStore() {
  const map = new Map<string, string>();
  return {
    get: (key: string) => map.get(key) ?? null,
    set: (key: string, value: string) => {
      map.set(key, value);
    },
    delete: (key: string) => {
      map.delete(key);
    },
  };
}

export const enokiFlow = new EnokiFlow({
  apiKey: ENOKI_PUBLIC_API_KEY ?? "",
  store: createMemoryStore(),
});
