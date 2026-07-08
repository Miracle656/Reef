/**
 * "Last time I looked at my messages" watermark — powers the navbar's unread
 * badge. The messages page stamps it (mount, opening a chat, live arrivals);
 * the badge counts indexer message-pings newer than it. Same pattern as the
 * notifications badge's `reef:notif-seen`.
 */

export const MSGS_SEEN_EVENT = "reef:msgs-seen";

function key(address: string): string {
  return `reef:msgs-seen:${address.toLowerCase()}`;
}

export function readMsgsSeen(address: string): number {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(key(address)) || 0);
}

export function markMsgsSeen(address: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(address), String(Date.now()));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(MSGS_SEEN_EVENT));
}
