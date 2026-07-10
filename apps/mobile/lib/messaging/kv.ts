/**
 * Synchronous key-value store — the mobile stand-in for web `localStorage` in
 * the messaging layer (group cache, delegate grants, message cache, vault).
 * In-memory map mirrored to a JSON file in the app's private document dir
 * (same pattern as lib/enoki.ts's session store). Falls back to pure
 * in-memory if the filesystem is unavailable.
 */

import { File, Paths } from "expo-file-system";

let file: File | null = null;
try {
  file = new File(Paths.document, "reef-messaging-store.json");
} catch {
  file = null;
}

function read(): Record<string, string> {
  try {
    if (file?.exists) return JSON.parse(file.textSync()) as Record<string, string>;
  } catch {
    /* corrupt/missing → start fresh */
  }
  return {};
}

const map = read();

function flush(): void {
  if (!file) return;
  try {
    file.write(JSON.stringify(map));
  } catch {
    try {
      file.create();
      file.write(JSON.stringify(map));
    } catch {
      /* read-only / unavailable → in-memory only this session */
    }
  }
}

export const kv = {
  getItem(key: string): string | null {
    return key in map ? map[key]! : null;
  },
  setItem(key: string, value: string): void {
    map[key] = value;
    flush();
  },
  removeItem(key: string): void {
    delete map[key];
    flush();
  },
};
