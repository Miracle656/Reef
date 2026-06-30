/**
 * ── THE ONCHAIN HANDOFF SEAM ────────────────────────────────────────────────
 *
 * `Messaging` is the single interface the entire /messages UI talks to. The UI
 * never imports an adapter directly — it imports `messaging` from `./index`,
 * which picks an implementation.
 *
 * Today that implementation is `mock-adapter.ts` (localStorage + an in-memory
 * event bus). To take messaging on-chain, another dev implements this exact
 * interface in `sui-adapter.ts` (Sui Stack Messaging SDK / Seal / Walrus) and
 * flips the selector in `index.ts`. Nothing else in the UI changes.
 *
 * Conventions:
 *  - every read/write is async (Promise) — maps cleanly to SDK calls + RPC.
 *  - real-time updates arrive via `subscribe()` (replaces the socket.io layer).
 *  - the adapter is told who "we" are via `setCurrentUser()` before any call.
 */

import type {
  Chat,
  ChosenState,
  Me,
  Message,
  MessageType,
  Participant,
  PollState,
  Status,
  StatusGroup,
} from "./types";

// ── inputs ──────────────────────────────────────────────────────────────────

export interface SendMessageInput {
  chatId: string;
  type?: MessageType;
  content: string;
  replyToId?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  isWhisper?: boolean;
  isForwarded?: boolean;
  viewOnce?: boolean;
  mentionIds?: string[];
  audienceIds?: string[];
  /** client-generated id for optimistic reconciliation */
  clientId?: string;
}

export interface GroupPatch {
  name?: string;
  description?: string;
  avatarUrl?: string;
  allowAsides?: boolean;
  allowChosen?: boolean;
}

export interface CreateGroupInput {
  name: string;
  participantIds: string[];
  description?: string;
  avatarUrl?: string;
}

export interface UploadResult {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface StatusInput {
  type: "text" | "image";
  content: string;
  mediaUrl?: string;
  bg?: string;
}

export interface ChosenConfig {
  mode: "dare" | "truth" | "both";
  category: string;
}

// ── events (replaces socket.io) ──────────────────────────────────────────────

export type MessagingEvent =
  | { type: "message"; message: Message; isOwn: boolean; mentionsMe: boolean }
  | { type: "message_edited"; chatId: string; messageId: string; content: string; editedAt: string }
  | { type: "message_deleted"; chatId: string; messageId: string }
  | { type: "reaction_added"; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: "reaction_removed"; chatId: string; messageId: string; userId: string; emoji: string }
  | { type: "message_pinned"; chatId: string; messageId: string; isPinned: boolean }
  | { type: "poll_voted"; chatId: string; messageId: string; poll: PollState }
  | { type: "aside_granted"; chatId: string; message: Message }
  | { type: "typing"; chatId: string; userId: string; username: string; isTyping: boolean }
  | { type: "read"; chatId: string; userId: string }
  | { type: "delivered"; chatId: string; messageId: string }
  | { type: "presence"; onlineUserIds: string[] }
  | { type: "chat_updated"; chatId: string }
  | { type: "chat_created"; chat: Chat }
  | { type: "chosen_state"; game: ChosenState }
  | { type: "chosen_ended"; chatId: string };

export type MessagingEventHandler = (event: MessagingEvent) => void;

// ── the interface ────────────────────────────────────────────────────────────

export interface Messaging {
  /** Identify the acting user. Call once after sign-in, before other calls. */
  setCurrentUser(me: Me): void;

  // stories / status (phase C) -------------------------------------------
  listStatus(): Promise<StatusGroup[]>;
  postStatus(input: StatusInput): Promise<void>;
  viewStatus(statusId: string): Promise<void>;
  deleteStatus(statusId: string): Promise<void>;

  // the Chosen game (real-time party game) (phase C) ---------------------
  chosenStart(chatId: string, config: ChosenConfig): Promise<void>;
  chosenJoin(chatId: string): Promise<void>;
  chosenLeave(chatId: string): Promise<void>;
  chosenTap(chatId: string): Promise<void>;
  chosenPick(chatId: string, n: number): Promise<void>;
  chosenNext(chatId: string): Promise<void>;
  chosenEnd(chatId: string): Promise<void>;
  chosenSync(chatId: string): Promise<void>;

  // chats ----------------------------------------------------------------
  listChats(): Promise<Chat[]>;
  getChat(chatId: string): Promise<Chat | null>;
  createDirect(participantId: string): Promise<Chat>;
  createGroup(input: CreateGroupInput): Promise<Chat>;
  markRead(chatId: string): Promise<void>;

  // messages -------------------------------------------------------------
  listMessages(chatId: string, cursor?: string | null): Promise<{ messages: Message[]; nextCursor: string | null }>;
  sendMessage(input: SendMessageInput): Promise<Message>;
  editMessage(messageId: string, content: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  addReaction(messageId: string, emoji: string): Promise<void>;
  removeReaction(messageId: string, emoji: string): Promise<void>;
  searchMessages(chatId: string, query: string): Promise<Message[]>;

  // pins / saved / polls / disappearing / view-once (phase C) ------------
  setDisappearing(chatId: string, seconds: number): Promise<void>;
  pinMessage(messageId: string, pinned: boolean): Promise<void>;
  listPinned(chatId: string): Promise<Message[]>;
  saveMessage(messageId: string): Promise<void>;
  unsaveMessage(messageId: string): Promise<void>;
  listSaved(): Promise<Message[]>;
  createPoll(chatId: string, question: string, options: string[], allowMultiple: boolean): Promise<Message>;
  votePoll(messageId: string, optionIndex: number): Promise<void>;
  markViewOnce(messageId: string): Promise<void>;

  // the vault (passcode-locked chats) (phase C) --------------------------
  vaultStatus(): Promise<{ hasPasscode: boolean; unlocked: boolean }>;
  vaultSetup(passcode: string, currentPasscode?: string): Promise<void>;
  vaultUnlock(passcode: string): Promise<boolean>;
  lockVault(): void;
  listVaultChats(): Promise<Chat[]>;
  setChatVaulted(chatId: string, vaulted: boolean): Promise<void>;

  // group / chat management ----------------------------------------------
  updateGroup(chatId: string, patch: GroupPatch): Promise<Chat>;
  addParticipants(chatId: string, userIds: string[]): Promise<Chat>;
  removeParticipant(chatId: string, userId: string): Promise<Chat>;
  setAdmin(chatId: string, userId: string, admin: boolean): Promise<Chat>;
  leaveGroup(chatId: string): Promise<void>;
  setChatSettings(chatId: string, settings: { muted?: boolean; archived?: boolean }): Promise<void>;

  // presence / typing ----------------------------------------------------
  setTyping(chatId: string, isTyping: boolean): void;

  // people ---------------------------------------------------------------
  searchUsers(query: string): Promise<Participant[]>;

  // media ----------------------------------------------------------------
  uploadMedia(file: File): Promise<UploadResult>;

  // real-time ------------------------------------------------------------
  /** Subscribe to live events. Returns an unsubscribe fn. */
  subscribe(handler: MessagingEventHandler): () => void;
}

// NOTE: model types (Chat, Message, …) are exported from ./types and re-exported
// by ./index. They are intentionally NOT re-exported here to avoid an ambiguous
// double `export *` in ./index.
