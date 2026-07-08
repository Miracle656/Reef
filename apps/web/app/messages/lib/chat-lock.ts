/**
 * Chat lock — passcode-protect specific chats. They disappear from the chat
 * list until you enter the passcode, and re-lock automatically after an idle
 * window the user picks (5 min – 1 hour).
 *
 * Fully client-side by design: the passcode never leaves this device (only a
 * salted SHA-256 hash is stored, per signed-in address), matching the E2E
 * posture of the chats it protects. It's a privacy screen for shared devices,
 * not server-side access control — the messages themselves are already
 * end-to-end encrypted.
 */

export const RELOCK_CHOICES = [
  { label: "5 minutes", minutes: 5 },
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
] as const;

const DEFAULT_RELOCK_MINUTES = 30;

interface LockStore {
  salt: string;
  hash: string;
  lockedIds: string[];
  relockMinutes: number;
  /** last successful unlock (ms) — unlocked while now-unlockedAt < relock window */
  unlockedAt: number | null;
}

const key = (me: string) => `reef:chatlock:v1:${me}`;

function read(me: string): LockStore | null {
  try {
    const raw = localStorage.getItem(key(me));
    return raw ? (JSON.parse(raw) as LockStore) : null;
  } catch {
    return null;
  }
}

function write(me: string, s: LockStore): void {
  localStorage.setItem(key(me), JSON.stringify(s));
}

async function hashPasscode(salt: string, passcode: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${passcode}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ChatLockState {
  hasPasscode: boolean;
  unlocked: boolean;
  lockedIds: string[];
  relockMinutes: number;
  /** ms until auto-relock (null when locked or no passcode) */
  msLeft: number | null;
}

export function getChatLockState(me: string | undefined): ChatLockState {
  const none: ChatLockState = { hasPasscode: false, unlocked: false, lockedIds: [], relockMinutes: DEFAULT_RELOCK_MINUTES, msLeft: null };
  if (!me || typeof window === "undefined") return none;
  const s = read(me);
  if (!s) return none;
  const windowMs = s.relockMinutes * 60_000;
  const msLeft = s.unlockedAt != null ? s.unlockedAt + windowMs - Date.now() : -1;
  const unlocked = msLeft > 0;
  return {
    hasPasscode: true,
    unlocked,
    lockedIds: s.lockedIds,
    relockMinutes: s.relockMinutes,
    msLeft: unlocked ? msLeft : null,
  };
}

/** First-time setup, or change (requires the current passcode). */
export async function setupChatLock(me: string, passcode: string, currentPasscode?: string): Promise<void> {
  const existing = read(me);
  if (existing) {
    const current = await hashPasscode(existing.salt, currentPasscode ?? "");
    if (current !== existing.hash) throw new Error("Current passcode is incorrect");
  }
  const salt = crypto.randomUUID();
  write(me, {
    salt,
    hash: await hashPasscode(salt, passcode),
    lockedIds: existing?.lockedIds ?? [],
    relockMinutes: existing?.relockMinutes ?? DEFAULT_RELOCK_MINUTES,
    unlockedAt: Date.now(),
  });
}

/** True + starts the relock timer on a correct passcode. */
export async function unlockChatLock(me: string, passcode: string): Promise<boolean> {
  const s = read(me);
  if (!s) return false;
  if ((await hashPasscode(s.salt, passcode)) !== s.hash) return false;
  write(me, { ...s, unlockedAt: Date.now() });
  return true;
}

export function lockChatLockNow(me: string): void {
  const s = read(me);
  if (s) write(me, { ...s, unlockedAt: null });
}

export function setChatLocked(me: string, chatId: string, locked: boolean): void {
  const s = read(me);
  if (!s) return;
  const ids = new Set(s.lockedIds);
  if (locked) ids.add(chatId);
  else ids.delete(chatId);
  write(me, { ...s, lockedIds: [...ids] });
}

export function setRelockMinutes(me: string, minutes: number): void {
  const s = read(me);
  if (s) write(me, { ...s, relockMinutes: minutes });
}
