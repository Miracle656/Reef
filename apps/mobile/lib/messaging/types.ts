/**
 * Messaging data model — ported from the Mystry messaging app and adapted for
 * ReeF/Umbra. These shapes are the contract between the UI and whatever data
 * layer backs it (mock today, Sui Stack Messaging SDK after the onchain port).
 *
 * Keep this file framework-agnostic: no React, no adapter imports.
 */

/** A single emoji reaction on a message. */
export interface Reaction {
  messageId: string;
  /** Sui address (or handle) of the reacting user. */
  userId: string;
  emoji: string;
}

export type MessageType =
  | "text"
  | "image"
  | "file"
  | "voice"
  | "location"
  | "poll"
  | "system";

export type MessageStatus = "sent" | "delivered" | "read";

export interface PollState {
  id: string;
  question: string;
  allowMultiple: boolean;
  options: { text: string; votes: number }[];
  totalVoters: number;
  /** option indices this user voted for */
  myVotes: number[];
}

export interface Message {
  id: string;
  chatId: string;
  /** Sui address (or handle) of the sender. */
  senderId: string;
  type: MessageType;
  content: string;

  // attachments
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;

  // threading
  replyToId?: string;

  // delivery
  status: MessageStatus;

  // lifecycle flags
  isDeleted?: boolean;
  isEdited?: boolean;
  editedAt?: string;
  isForwarded?: boolean;
  isPinned?: boolean;

  // privacy features
  isWhisper?: boolean;
  expiresAt?: string;
  viewOnce?: boolean;
  viewOnceViewed?: boolean;
  /** message visible only to these user ids (+ sender); others see `redacted` */
  audienceIds?: string[];
  redacted?: boolean;

  // mentions
  mentionIds?: string[];

  // optimistic-send bookkeeping (client only)
  pending?: boolean;
  failed?: boolean;
  clientId?: string;

  reactions?: Reaction[];
  poll?: PollState;

  createdAt: string;
  sender?: ChatUser;
}

/** Lightweight user shape used inside chats. Maps to a Sui profile. */
export interface ChatUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  lastSeenAt?: string;
}

export type Participant = ChatUser;

export type ChatType = "direct" | "group";

export interface Chat {
  id: string;
  type: ChatType;
  name?: string;
  avatarUrl?: string;
  description?: string;
  createdBy?: string;
  adminIds?: string[];
  allowAsides?: boolean;
  allowChosen?: boolean;
  participants: Participant[];
  lastMessage?: Message | null;
  lastMessageAt?: string;
  unreadCount?: number;
  mentioned?: boolean;
  muted?: boolean;
  archived?: boolean;
  vaulted?: boolean;
  disappearingSeconds?: number;
}

/** Real-time multiplayer party game state (the "Chosen" game). */
export interface ChosenState {
  chatId: string;
  phase: "polling" | "arming" | "pulsing" | "revealed";
  mode: "dare" | "truth" | "both";
  initiatorId: string;
  category: string;
  players: string[];
  tapped: string[];
  daresLeft: number;
  truthsLeft: number;
  chosenId: string | null;
  round: number;
  revealedText: string | null;
  revealedKind: "dare" | "truth" | null;
  pollEndsAt: number | null;
}

/** Status / story entry (24h ephemeral). */
export interface Status {
  id: string;
  userId: string;
  type: "text" | "image";
  content: string;
  mediaUrl?: string;
  bg?: string;
  createdAt: string;
  viewedBy?: string[];
}

/** A user's grouped statuses, as returned for the stories bar. */
export interface StatusGroup {
  user: ChatUser;
  items: Status[];
  hasUnseen: boolean;
}

/** The current signed-in identity, derived from ReeF's zkLogin profile. */
export interface Me {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}
