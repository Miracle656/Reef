import { EnokiFlow } from "@mysten/enoki";
import { File, Paths } from "expo-file-system";
import { ENOKI_PUBLIC_API_KEY } from "./config";

/**
 * Persistent, *synchronous* session store for EnokiFlow so sign-in survives app
 * restarts. Enoki reads its store synchronously, and expo-file-system's File API
 * is synchronous, so we keep an in-memory map mirrored to a JSON file. Falls
 * back to pure in-memory if the filesystem is unavailable. (SecureStore can't be
 * used: its 2 KB value cap is too small for the session jwt + ephemeral key, and
 * its keys reject the "@"/"/" Enoki uses.)
 */
function createPersistentStore() {
  let file: File | null = null;
  try {
    file = new File(Paths.document, "reef-enoki-session.json");
  } catch {
    file = null;
  }

  const read = (): Record<string, string> => {
    try {
      if (file?.exists) return JSON.parse(file.textSync()) as Record<string, string>;
    } catch {
      /* corrupt/missing → start fresh */
    }
    return {};
  };

  const map = read();
  const flush = () => {
    if (!file) return;
    try {
      file.write(JSON.stringify(map));
    } catch {
      try {
        file.create();
        file.write(JSON.stringify(map));
      } catch {
        /* read-only / unavailable → behaves as in-memory for this session */
      }
    }
  };

  return {
    get: (key: string) => (key in map ? map[key]! : null),
    set: (key: string, value: string) => {
      map[key] = value;
      flush();
    },
    delete: (key: string) => {
      delete map[key];
      flush();
    },
  };
}

/**
 * Enoki's default session encryption uses `crypto.subtle` (PBKDF2 + AES-GCM),
 * which Hermes doesn't provide. We pass a passthrough — the session lives in the
 * app's private sandboxed document directory, so there's nothing cross-app to
 * protect.
 */
const passthroughEncryption = {
  encrypt: async (_password: string, data: string) => data,
  decrypt: async (_password: string, data: string) => data,
};

export const enokiFlow = new EnokiFlow({
  apiKey: ENOKI_PUBLIC_API_KEY ?? "",
  store: createPersistentStore(),
  encryption: passthroughEncryption,
});
