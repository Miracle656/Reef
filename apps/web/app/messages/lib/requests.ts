/**
 * ── MESSAGE REQUESTS (anti-spam inbox) ────────────────────────────────────────
 *
 * Anyone can start an on-chain chat with anyone — that's by design (encrypted,
 * permissionless). But the INBOX is ours: a DM from someone the user doesn't
 * follow lands in a separate "Requests" pile until the user accepts it or
 * replies. Nothing on-chain changes; this is purely how the client presents.
 *
 * A DM counts as accepted when ANY of:
 *   - I follow the sender (the indexer's follow graph),
 *   - I've ever replied / started the chat myself (persisted per-device),
 *   - I tapped Accept on the request.
 */

import type { Chat } from "./types";

function acceptedKey(me: string): string {
  return `reef:msg-accepted:v1:${me.toLowerCase()}`;
}

export function readAccepted(me: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(acceptedKey(me)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function markAccepted(me: string, peer: string): void {
  if (typeof window === "undefined") return;
  const s = readAccepted(me);
  if (s.has(peer.toLowerCase())) return;
  s.add(peer.toLowerCase());
  try {
    window.localStorage.setItem(acceptedKey(me), JSON.stringify([...s]));
  } catch {
    /* quota */
  }
}

/** The non-me participant of a DM, lowercased. */
export function requestPeerOf(c: Chat, meId: string): string | undefined {
  if (c.type !== "direct") return undefined;
  return c.participants.find((p) => p.id.toLowerCase() !== meId.toLowerCase())?.id.toLowerCase();
}

export function isRequestChat(
  c: Chat,
  meId: string,
  following: Set<string>,
  accepted: Set<string>,
): boolean {
  const peer = requestPeerOf(c, meId);
  if (!peer) return false; // groups and unresolvable DMs stay in the inbox
  if (following.has(peer) || accepted.has(peer)) return false;
  // If the latest message is mine I clearly engaged — treat as accepted.
  if (c.lastMessage?.senderId?.toLowerCase() === meId.toLowerCase()) return false;
  return true;
}
