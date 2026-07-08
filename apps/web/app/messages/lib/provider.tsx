"use client";

/**
 * MessagingProvider — the app-side state layer for /messages.
 *
 * Replaces Mystry's Redux store + socket.io wiring: it holds chat/message state,
 * subscribes to the adapter's event bus, and exposes bound actions via
 * `useMessaging()`. Identity comes from ReeF's zkLogin account + indexer profile.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { canonicalStatusBytes, canonicalStatusDeleteBytes, walrus } from "@umbra/core";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { useSocialAccount } from "@/lib/account";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { useEnokiSignPersonalMessage, useGasless } from "@/lib/gasless";
import { markMsgsSeen } from "@/lib/msg-seen";
import { getDelegateKeypair } from "./messaging-identity";
import { createReefMessagingClient } from "./messaging-client";
import { messagingEnv, isMessagingConfigured } from "./sui-config";
import { setMessagingRuntime } from "./runtime";
import { markAccepted, requestPeerOf } from "./requests";
import {
  getChatLockState,
  lockChatLockNow,
  setChatLocked as storeChatLocked,
  setRelockMinutes as storeRelockMinutes,
  setupChatLock,
  unlockChatLock,
  type ChatLockState,
} from "./chat-lock";
import { applyControl, applyVote, markViewedOnce } from "./control";
import { CONTROL_TYPES } from "./types";
import { messaging, type Chat, type ChosenConfig, type ChosenState, type CreateGroupInput, type GroupPatch, type Me, type Message, type Participant, type SendMessageInput, type StatusGroup, type StatusInput, type UploadResult } from "./index";

// ── state ──────────────────────────────────────────────────────────────────────

interface State {
  chats: Chat[];
  activeChatId: string | null;
  messages: Record<string, Message[]>;
  loadedChats: Record<string, boolean>;
  typingUsers: Record<string, string[]>;
  onlineUserIds: string[];
  chosenGames: Record<string, ChosenState>;
  loadingChats: boolean;
}

const initialState: State = {
  chats: [],
  activeChatId: null,
  messages: {},
  loadedChats: {},
  typingUsers: {},
  onlineUserIds: [],
  chosenGames: {},
  loadingChats: true,
};

type Action =
  | { t: "SET_CHATS"; chats: Chat[] }
  | { t: "ADD_CHAT"; chat: Chat }
  | { t: "UPDATE_CHAT"; chat: Partial<Chat> & { id: string } }
  | { t: "SET_ACTIVE"; chatId: string | null }
  | { t: "SET_MESSAGES"; chatId: string; messages: Message[] }
  | { t: "ADD_MESSAGE"; message: Message; isOwn: boolean; mentionsMe: boolean; activeChatId: string | null }
  | { t: "RECONCILE"; chatId: string; clientId: string; message: Message }
  | { t: "MARK_FAILED"; chatId: string; clientId: string }
  | { t: "EDIT_MESSAGE"; chatId: string; messageId: string; content: string; editedAt?: string }
  | { t: "DELETE_MESSAGE"; chatId: string; messageId: string }
  | { t: "REACTION"; chatId: string; messageId: string; userId: string; emoji: string; add: boolean }
  | { t: "CLEAR_UNREAD"; chatId: string }
  | { t: "STATUS"; chatId: string; messageId: string; status: Message["status"] }
  | { t: "ALL_READ"; chatId: string }
  | { t: "TYPING"; chatId: string; username: string; isTyping: boolean }
  | { t: "ONLINE"; ids: string[] }
  | { t: "PIN"; chatId: string; messageId: string; isPinned: boolean }
  | { t: "POLL"; chatId: string; messageId: string; poll: NonNullable<Message["poll"]> }
  | { t: "POLL_VOTE"; chatId: string; pollId: string; userId: string; optionIndex: number; meId: string }
  | { t: "VIEWONCE"; chatId: string; messageId: string }
  | { t: "ADD_CHATS"; chats: Chat[] }
  | { t: "CHOSEN_SET"; game: ChosenState }
  | { t: "CHOSEN_CLEAR"; chatId: string };

function upsertMessage(list: Message[], message: Message): Message[] {
  if (list.some((m) => m.id === message.id)) return list.map((m) => (m.id === message.id ? message : m));
  return [...list, message];
}

function reducer(state: State, a: Action): State {
  switch (a.t) {
    case "SET_CHATS":
      return { ...state, chats: a.chats, loadingChats: false };
    case "ADD_CHAT":
      return state.chats.some((c) => c.id === a.chat.id)
        ? state
        : { ...state, chats: [a.chat, ...state.chats] };
    case "UPDATE_CHAT":
      return { ...state, chats: state.chats.map((c) => (c.id === a.chat.id ? { ...c, ...a.chat } : c)) };
    case "SET_ACTIVE":
      return { ...state, activeChatId: a.chatId };
    case "SET_MESSAGES":
      return {
        ...state,
        messages: { ...state.messages, [a.chatId]: a.messages },
        loadedChats: { ...state.loadedChats, [a.chatId]: true },
      };
    case "ADD_MESSAGE": {
      const { message, isOwn, mentionsMe, activeChatId } = a;
      const list = state.messages[message.chatId] ?? [];
      const messages = { ...state.messages, [message.chatId]: upsertMessage(list, message) };
      const chats = state.chats
        .map((c) =>
          c.id === message.chatId
            ? {
                ...c,
                lastMessage: message,
                lastMessageAt: message.createdAt,
                unreadCount:
                  !isOwn && activeChatId !== message.chatId ? (c.unreadCount ?? 0) + 1 : c.unreadCount,
                mentioned: !isOwn && mentionsMe ? true : c.mentioned,
              }
            : c,
        )
        .sort((x, y) => (y.lastMessageAt ?? "").localeCompare(x.lastMessageAt ?? ""));
      return { ...state, messages, chats };
    }
    case "RECONCILE": {
      const list = state.messages[a.chatId] ?? [];
      const idx = list.findIndex((m) => m.clientId === a.clientId || m.id === a.clientId);
      const next = idx >= 0 ? list.map((m, i) => (i === idx ? a.message : m)) : upsertMessage(list, a.message);
      return { ...state, messages: { ...state.messages, [a.chatId]: next } };
    }
    case "MARK_FAILED":
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: (state.messages[a.chatId] ?? []).map((m) =>
            m.clientId === a.clientId || m.id === a.clientId ? { ...m, pending: false, failed: true } : m,
          ),
        },
      };
    case "EDIT_MESSAGE":
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: (state.messages[a.chatId] ?? []).map((m) =>
            m.id === a.messageId ? { ...m, content: a.content, isEdited: true, editedAt: a.editedAt } : m,
          ),
        },
      };
    case "DELETE_MESSAGE":
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: (state.messages[a.chatId] ?? []).map((m) =>
            m.id === a.messageId ? { ...m, isDeleted: true, content: "" } : m,
          ),
        },
      };
    case "REACTION": {
      const list = state.messages[a.chatId] ?? [];
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: list.map((m) => {
            if (m.id !== a.messageId) return m;
            const reactions = m.reactions ?? [];
            if (a.add) {
              if (reactions.some((r) => r.userId === a.userId && r.emoji === a.emoji)) return m;
              return { ...m, reactions: [...reactions, { messageId: a.messageId, userId: a.userId, emoji: a.emoji }] };
            }
            return { ...m, reactions: reactions.filter((r) => !(r.userId === a.userId && r.emoji === a.emoji)) };
          }),
        },
      };
    }
    case "CLEAR_UNREAD":
      return {
        ...state,
        chats: state.chats.map((c) => (c.id === a.chatId ? { ...c, unreadCount: 0, mentioned: false } : c)),
      };
    case "STATUS":
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: (state.messages[a.chatId] ?? []).map((m) => (m.id === a.messageId ? { ...m, status: a.status } : m)),
        },
      };
    case "ALL_READ":
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: (state.messages[a.chatId] ?? []).map((m) => (m.status !== "read" ? { ...m, status: "read" } : m)),
        },
      };
    case "TYPING": {
      const cur = state.typingUsers[a.chatId] ?? [];
      const next = a.isTyping ? (cur.includes(a.username) ? cur : [...cur, a.username]) : cur.filter((u) => u !== a.username);
      return { ...state, typingUsers: { ...state.typingUsers, [a.chatId]: next } };
    }
    case "ONLINE":
      return { ...state, onlineUserIds: a.ids };
    case "PIN":
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: (state.messages[a.chatId] ?? []).map((m) => (m.id === a.messageId ? { ...m, isPinned: a.isPinned } : m)),
        },
      };
    case "POLL":
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: (state.messages[a.chatId] ?? []).map((m) => (m.id === a.messageId ? { ...m, poll: a.poll } : m)),
        },
      };
    case "POLL_VOTE":
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: (state.messages[a.chatId] ?? []).map((m) => {
            if (m.id !== a.pollId || !m.poll) return m;
            const poll = applyVote(m.poll, a.userId, a.optionIndex);
            return { ...m, poll: { ...poll, myVotes: poll.voters?.[a.meId] ?? [] } };
          }),
        },
      };
    case "VIEWONCE":
      return {
        ...state,
        messages: {
          ...state.messages,
          [a.chatId]: (state.messages[a.chatId] ?? []).map((m) => (m.id === a.messageId ? { ...m, viewOnceViewed: true } : m)),
        },
      };
    case "ADD_CHATS": {
      const have = new Set(state.chats.map((c) => c.id));
      const merged = [...state.chats];
      for (const c of a.chats) if (!have.has(c.id)) merged.push(c);
      return { ...state, chats: merged };
    }
    case "CHOSEN_SET":
      return { ...state, chosenGames: { ...state.chosenGames, [a.game.chatId]: a.game } };
    case "CHOSEN_CLEAR": {
      const next = { ...state.chosenGames };
      delete next[a.chatId];
      return { ...state, chosenGames: next };
    }
    default:
      return state;
  }
}

// ── identity ────────────────────────────────────────────────────────────────────

/** Derive the messaging identity from ReeF's zkLogin account + indexer profile. */
function useMe(): Me | null {
  const account = useSocialAccount();
  const profile = useQuery({
    queryKey: ["profile-by-addr", account?.address],
    queryFn: () => trpc.profileByAddress.query({ address: account!.address }),
    enabled: Boolean(account),
    retry: false,
  });
  return useMemo(() => {
    if (!account) return null;
    const p = profile.data;
    const avatarUrl = p?.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : undefined;
    return {
      id: account.address,
      username: p?.handle ?? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`,
      displayName: p?.displayName ?? p?.handle,
      avatarUrl,
    };
  }, [account, profile.data]);
}

// ── context ────────────────────────────────────────────────────────────────────

interface MessagingContext {
  me: Me | null;
  ready: boolean;
  state: State;
  activeChat: Chat | null;
  openChat: (chatId: string | null) => void;
  send: (input: Omit<SendMessageInput, "clientId">) => Promise<void>;
  startDirect: (userId: string) => Promise<string>;
  createGroup: (input: CreateGroupInput) => Promise<string>;
  searchUsers: (q: string) => Promise<Participant[]>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  listBlocked: () => Promise<Participant[]>;
  reportUser: (userId: string, reason: string, chatId?: string) => Promise<void>;
  setTyping: (chatId: string, isTyping: boolean) => void;
  refreshChats: () => Promise<void>;
  // phase B
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (message: Message, emoji: string) => Promise<void>;
  forwardMessage: (targetChatId: string, message: Message) => Promise<void>;
  searchMessages: (chatId: string, q: string) => Promise<Message[]>;
  updateGroup: (chatId: string, patch: GroupPatch) => Promise<void>;
  addParticipants: (chatId: string, userIds: string[]) => Promise<void>;
  removeParticipant: (chatId: string, userId: string) => Promise<void>;
  setAdmin: (chatId: string, userId: string, admin: boolean) => Promise<void>;
  leaveGroup: (chatId: string) => Promise<void>;
  setChatSettings: (chatId: string, settings: { muted?: boolean; archived?: boolean }) => Promise<void>;
  uploadMedia: (file: File) => Promise<UploadResult>;
  // phase C
  setDisappearing: (chatId: string, seconds: number) => Promise<void>;
  pinMessage: (messageId: string, pinned: boolean) => Promise<void>;
  listPinned: (chatId: string) => Promise<Message[]>;
  saveMessage: (messageId: string) => Promise<void>;
  unsaveMessage: (messageId: string) => Promise<void>;
  listSaved: () => Promise<Message[]>;
  createPoll: (chatId: string, question: string, options: string[], allowMultiple: boolean) => Promise<void>;
  votePoll: (messageId: string, optionIndex: number) => Promise<void>;
  markViewOnce: (message: Message) => Promise<void>;
  // chat lock (client-side passcode; auto-relocks after chatLock.relockMinutes)
  chatLock: ChatLockState;
  chatLockSetup: (passcode: string, currentPasscode?: string) => Promise<void>;
  chatLockUnlock: (passcode: string) => Promise<boolean>;
  chatLockNow: () => void;
  setChatLocked: (chatId: string, locked: boolean) => void;
  setChatLockRelock: (minutes: number) => void;
  // stories
  listStatus: () => Promise<StatusGroup[]>;
  postStatus: (input: StatusInput) => Promise<void>;
  viewStatus: (statusId: string) => Promise<void>;
  deleteStatus: (statusId: string) => Promise<void>;
  // chosen game
  chosen: {
    start: (chatId: string, config: ChosenConfig) => Promise<void>;
    tap: (chatId: string) => Promise<void>;
    pick: (chatId: string, n: number) => Promise<void>;
    next: (chatId: string) => Promise<void>;
    end: (chatId: string) => Promise<void>;
    sync: (chatId: string) => Promise<void>;
  };
}

const Ctx = createContext<MessagingContext | null>(null);

export function MessagingProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const account = useSocialAccount();
  const sponsorExecute = useGasless();
  const [state, dispatch] = useReducer(reducer, initialState);

  // Build the on-chain messaging runtime and inject it into the SuiMessaging
  // adapter. Two identities work together:
  //  - the user's zkLogin address is the on-chain group admin (its txs are
  //    Enoki-sponsored via `sponsorExecute`), which can grant the delegate;
  //  - a per-device Ed25519 *delegate* keypair signs all relayer/message ops
  //    (the relayer needs a real keypair signature — zkLogin can't auth).
  // No-op on the mock adapter.
  useEffect(() => {
    if (!me || !account || !isMessagingConfigured()) {
      setMessagingRuntime(null);
      return;
    }
    const delegate = getDelegateKeypair(account.address);
    const client = createReefMessagingClient(delegate);
    const graphqlClient = new SuiGraphQLClient({ url: messagingEnv.graphqlUrl, network: messagingEnv.network });
    setMessagingRuntime({
      client,
      signer: delegate,
      delegateAddress: delegate.toSuiAddress(),
      graphqlClient,
      me,
      sponsorExecute,
    });
    return () => setMessagingRuntime(null);
  }, [me, account, sponsorExecute]);
  const activeRef = useRef<string | null>(null);
  activeRef.current = state.activeChatId;
  const meRef = useRef<Me | null>(null);
  meRef.current = me;
  const chatsRef = useRef<Chat[]>([]);
  chatsRef.current = state.chats;
  const messagesRef = useRef<State["messages"]>({});
  messagesRef.current = state.messages;
  /** Which loaded chat holds this message (pin/save/vote act on the open chat). */
  const findChatOf = useCallback((messageId: string): string | null => {
    for (const [chatId, list] of Object.entries(messagesRef.current)) {
      if (list.some((m) => m.id === messageId)) return chatId;
    }
    return null;
  }, []);

  const refreshChats = useCallback(async () => {
    const chats = await messaging.listChats();
    dispatch({ t: "SET_CHATS", chats });
  }, []);

  // identity → adapter, then load chats
  useEffect(() => {
    if (!me) return;
    messaging.setCurrentUser(me);
    markMsgsSeen(me.id); // on /messages now — quiet the navbar badge
    void refreshChats();
    // Re-discover periodically so chats someone else just started with us
    // surface without a manual refresh (GraphQL membership indexing lags).
    const id = setInterval(() => void refreshChats(), 15000);
    return () => clearInterval(id);
  }, [me, refreshChats]);

  // live events
  useEffect(() => {
    const unsub = messaging.subscribe((e) => {
      switch (e.type) {
        case "message": {
          const m = e.message;
          // Control messages mutate their target instead of rendering.
          if (CONTROL_TYPES.has(m.type)) {
            if (m.type === "reaction" && m.targetId) {
              dispatch({ t: "REACTION", chatId: m.chatId, messageId: m.targetId, userId: m.senderId, emoji: m.content, add: !m.remove });
            } else if (m.type === "pin" && m.targetId) {
              dispatch({ t: "PIN", chatId: m.chatId, messageId: m.targetId, isPinned: Boolean(m.pinned) });
            } else if (m.type === "poll-vote" && m.targetId && m.optionIndex != null) {
              dispatch({ t: "POLL_VOTE", chatId: m.chatId, pollId: m.targetId, userId: m.senderId, optionIndex: m.optionIndex, meId: meRef.current?.id ?? "" });
            }
            break;
          }
          dispatch({ t: "ADD_MESSAGE", message: m, isOwn: e.isOwn, mentionsMe: e.mentionsMe, activeChatId: activeRef.current });
          if (!e.isOwn && activeRef.current === m.chatId) void messaging.markRead(m.chatId);
          // This provider only lives on /messages — the user is watching, so
          // arrivals shouldn't light the navbar badge.
          if (meRef.current) markMsgsSeen(meRef.current.id);
          break;
        }
        case "chat_created":
          dispatch({ t: "ADD_CHAT", chat: e.chat });
          break;
        case "chat_updated":
          void refreshChats();
          break;
        case "delivered":
          dispatch({ t: "STATUS", chatId: e.chatId, messageId: e.messageId, status: "delivered" });
          break;
        case "read":
          dispatch({ t: "ALL_READ", chatId: e.chatId });
          break;
        case "typing":
          dispatch({ t: "TYPING", chatId: e.chatId, username: e.username, isTyping: e.isTyping });
          break;
        case "message_edited":
          dispatch({ t: "EDIT_MESSAGE", chatId: e.chatId, messageId: e.messageId, content: e.content, editedAt: e.editedAt });
          break;
        case "message_deleted":
          dispatch({ t: "DELETE_MESSAGE", chatId: e.chatId, messageId: e.messageId });
          break;
        case "reaction_added":
          dispatch({ t: "REACTION", chatId: e.chatId, messageId: e.messageId, userId: e.userId, emoji: e.emoji, add: true });
          break;
        case "reaction_removed":
          dispatch({ t: "REACTION", chatId: e.chatId, messageId: e.messageId, userId: e.userId, emoji: e.emoji, add: false });
          break;
        case "presence":
          dispatch({ t: "ONLINE", ids: e.onlineUserIds });
          break;
        case "message_pinned":
          dispatch({ t: "PIN", chatId: e.chatId, messageId: e.messageId, isPinned: e.isPinned });
          break;
        case "poll_voted":
          dispatch({ t: "POLL", chatId: e.chatId, messageId: e.messageId, poll: e.poll });
          break;
        case "aside_granted":
          dispatch({ t: "ADD_MESSAGE", message: e.message, isOwn: false, mentionsMe: false, activeChatId: activeRef.current });
          break;
        case "chosen_state":
          dispatch({ t: "CHOSEN_SET", game: e.game });
          break;
        case "chosen_ended":
          dispatch({ t: "CHOSEN_CLEAR", chatId: e.chatId });
          break;
      }
    });
    return unsub;
  }, [refreshChats]);

  const openChat = useCallback(
    (chatId: string | null) => {
      dispatch({ t: "SET_ACTIVE", chatId });
      if (!chatId) return;
      dispatch({ t: "CLEAR_UNREAD", chatId });
      if (meRef.current) markMsgsSeen(meRef.current.id);
      void messaging.markRead(chatId);
      // Instant open: render the locally-cached thread now; the network fetch
      // that follows replaces it with fresh data.
      const meId = meRef.current?.id ?? "";
      const cached = messaging.peekMessages?.(chatId) ?? [];
      if (cached.length) dispatch({ t: "SET_MESSAGES", chatId, messages: applyControl(cached, meId) });
      messaging
        .listMessages(chatId)
        .then(({ messages }) => {
          // Don't wipe a cache-rendered thread on a transient empty response
          // (deletion isn't modeled on-chain yet, so empty-after-cached ≈ glitch).
          if (messages.length || !cached.length) dispatch({ t: "SET_MESSAGES", chatId, messages: applyControl(messages, meId) });
        })
        .catch(() => {
          /* keep the cached render — the poll retries */
        });
    },
    [],
  );

  const send = useCallback(async (input: Omit<SendMessageInput, "clientId">) => {
    const meNow = meRef.current;
    if (!meNow) return;
    const clientId = `c_${Math.random().toString(36).slice(2)}`;
    const optimistic: Message = {
      id: clientId,
      clientId,
      chatId: input.chatId,
      senderId: meNow.id,
      type: input.type ?? "text",
      content: input.content,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      replyToId: input.replyToId,
      isWhisper: input.isWhisper,
      viewOnce: input.viewOnce,
      mentionIds: input.mentionIds,
      audienceIds: input.audienceIds,
      status: "sent",
      pending: true,
      createdAt: new Date().toISOString(),
      sender: { id: meNow.id, username: meNow.username, displayName: meNow.displayName, avatarUrl: meNow.avatarUrl },
    };
    dispatch({ t: "ADD_MESSAGE", message: optimistic, isOwn: true, mentionsMe: false, activeChatId: activeRef.current });
    // Replying to a DM accepts it — it leaves the Requests pile for good.
    const chat = chatsRef.current.find((c) => c.id === input.chatId);
    const peer = chat ? requestPeerOf(chat, meNow.id) : undefined;
    if (peer) markAccepted(meNow.id, peer);
    try {
      const saved = await messaging.sendMessage({ ...input, clientId });
      dispatch({ t: "RECONCILE", chatId: input.chatId, clientId, message: { ...saved, sender: optimistic.sender } });
      // Content-free "something new" ping so recipients' navbar badges light
      // up even when they're not on /messages. Best-effort.
      const to = (chat?.participants ?? [])
        .map((p) => p.id)
        .filter((id) => id.startsWith("0x") && id.toLowerCase() !== meNow.id.toLowerCase())
        .slice(0, 50);
      if (to.length) void trpc.messagePing.mutate({ chatId: input.chatId, to }).catch(() => {});
    } catch {
      dispatch({ t: "MARK_FAILED", chatId: input.chatId, clientId });
    }
  }, []);

  const startDirect = useCallback(
    async (userId: string) => {
      if (meRef.current) markAccepted(meRef.current.id, userId); // I initiated it
      const chat = await messaging.createDirect(userId);
      dispatch({ t: "ADD_CHAT", chat });
      openChat(chat.id);
      return chat.id;
    },
    [openChat],
  );

  const createGroup = useCallback(
    async (input: CreateGroupInput) => {
      const chat = await messaging.createGroup(input);
      dispatch({ t: "ADD_CHAT", chat });
      openChat(chat.id);
      return chat.id;
    },
    [openChat],
  );

  const searchUsers = useCallback((q: string) => messaging.searchUsers(q), []);
  const blockUser = useCallback(async (userId: string) => {
    await messaging.blockUser(userId);
    await refreshChats();
  }, [refreshChats]);
  const unblockUser = useCallback((userId: string) => messaging.unblockUser(userId), []);
  const listBlocked = useCallback(() => messaging.listBlocked(), []);
  const reportUser = useCallback((userId: string, reason: string, chatId?: string) => messaging.reportUser(userId, reason, chatId), []);
  const setTyping = useCallback((chatId: string, isTyping: boolean) => messaging.setTyping(chatId, isTyping), []);
  const uploadMedia = useCallback((file: File) => messaging.uploadMedia(file), []);

  // phase B actions — adapter events drive the reducer, so these stay thin.
  const editMessage = useCallback((messageId: string, content: string) => messaging.editMessage(messageId, content), []);
  const deleteMessage = useCallback((messageId: string) => messaging.deleteMessage(messageId), []);
  const toggleReaction = useCallback(async (message: Message, emoji: string) => {
    const meId = meRef.current?.id;
    if (!meId) return;
    const mine = (message.reactions ?? []).some((r) => r.userId === meId && r.emoji === emoji);
    // Optimistic; the reaction travels as a hidden control message.
    dispatch({ t: "REACTION", chatId: message.chatId, messageId: message.id, userId: meId, emoji, add: !mine });
    await messaging
      .sendMessage({ chatId: message.chatId, type: "reaction", content: emoji, targetId: message.id, remove: mine })
      .catch(() => dispatch({ t: "REACTION", chatId: message.chatId, messageId: message.id, userId: meId, emoji, add: mine }));
  }, []);
  const forwardMessage = useCallback(async (targetChatId: string, message: Message) => {
    await messaging.sendMessage({
      chatId: targetChatId,
      type: message.type === "system" ? "text" : message.type,
      content: message.content,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimeType: message.mimeType,
      isForwarded: true,
    });
  }, []);
  const searchMessages = useCallback((chatId: string, q: string) => messaging.searchMessages(chatId, q), []);
  const updateGroup = useCallback(async (chatId: string, patch: GroupPatch) => {
    await messaging.updateGroup(chatId, patch);
    await refreshChats();
  }, [refreshChats]);
  const addParticipants = useCallback(async (chatId: string, userIds: string[]) => {
    await messaging.addParticipants(chatId, userIds);
    await refreshChats();
  }, [refreshChats]);
  const removeParticipant = useCallback(async (chatId: string, userId: string) => {
    await messaging.removeParticipant(chatId, userId);
    await refreshChats();
  }, [refreshChats]);
  const setAdmin = useCallback(async (chatId: string, userId: string, admin: boolean) => {
    await messaging.setAdmin(chatId, userId, admin);
    await refreshChats();
  }, [refreshChats]);
  const leaveGroup = useCallback(async (chatId: string) => {
    await messaging.leaveGroup(chatId);
    dispatch({ t: "SET_ACTIVE", chatId: null });
    await refreshChats();
  }, [refreshChats]);
  const setChatSettings = useCallback(async (chatId: string, settings: { muted?: boolean; archived?: boolean }) => {
    await messaging.setChatSettings(chatId, settings);
    dispatch({ t: "UPDATE_CHAT", chat: { id: chatId, ...settings } });
  }, []);

  // phase C actions
  const setDisappearing = useCallback(async (chatId: string, seconds: number) => {
    await messaging.setDisappearing(chatId, seconds);
    dispatch({ t: "UPDATE_CHAT", chat: { id: chatId, disappearingSeconds: seconds } });
  }, []);
  const pinMessage = useCallback(
    async (messageId: string, pinned: boolean) => {
      const chatId = findChatOf(messageId);
      if (!chatId) return;
      dispatch({ t: "PIN", chatId, messageId, isPinned: pinned });
      await messaging.sendMessage({ chatId, type: "pin", content: "", targetId: messageId, pinned }).catch(() => {});
    },
    [findChatOf],
  );
  const listPinned = useCallback(
    (chatId: string) => Promise.resolve((messagesRef.current[chatId] ?? []).filter((m) => m.isPinned && !m.isDeleted)),
    [],
  );
  // Saved messages are personal bookmarks — they live on this device only
  // (the chat is E2E encrypted; there's no server-side home for them).
  const savedKey = useCallback(() => `reef:msg-saved:v1:${(meRef.current?.id ?? "").toLowerCase()}`, []);
  const readSaved = useCallback((): Message[] => {
    try {
      return JSON.parse(window.localStorage.getItem(savedKey()) ?? "[]") as Message[];
    } catch {
      return [];
    }
  }, [savedKey]);
  const saveMessage = useCallback(
    async (messageId: string) => {
      const chatId = findChatOf(messageId);
      const msg = chatId ? messagesRef.current[chatId]?.find((m) => m.id === messageId) : undefined;
      if (!msg) return;
      const cur = readSaved().filter((m) => m.id !== messageId);
      try {
        window.localStorage.setItem(savedKey(), JSON.stringify([{ ...msg, pending: false }, ...cur].slice(0, 200)));
      } catch {
        /* quota */
      }
    },
    [findChatOf, readSaved, savedKey],
  );
  const unsaveMessage = useCallback(
    async (messageId: string) => {
      try {
        window.localStorage.setItem(savedKey(), JSON.stringify(readSaved().filter((m) => m.id !== messageId)));
      } catch {
        /* quota */
      }
    },
    [readSaved, savedKey],
  );
  const listSaved = useCallback(() => Promise.resolve(readSaved()), [readSaved]);
  const createPoll = useCallback(async (chatId: string, question: string, options: string[], allowMultiple: boolean) => {
    const msg = await messaging.createPoll(chatId, question, options, allowMultiple);
    dispatch({ t: "ADD_MESSAGE", message: msg, isOwn: true, mentionsMe: false, activeChatId: activeRef.current });
  }, []);
  const votePoll = useCallback(
    async (messageId: string, optionIndex: number) => {
      const meId = meRef.current?.id;
      const chatId = findChatOf(messageId);
      if (!meId || !chatId) return;
      dispatch({ t: "POLL_VOTE", chatId, pollId: messageId, userId: meId, optionIndex, meId });
      await messaging.sendMessage({ chatId, type: "poll-vote", content: "", targetId: messageId, optionIndex }).catch(() => {});
    },
    [findChatOf],
  );
  const markViewOnce = useCallback(async (message: Message) => {
    if (meRef.current) markViewedOnce(meRef.current.id, message.id); // survives re-fetch
    dispatch({ t: "VIEWONCE", chatId: message.chatId, messageId: message.id });
  }, []);
  // chat lock — passcode + auto-relock, entirely on this device (see chat-lock.ts).
  // lockEpoch forces re-derivation of the state after setup/unlock/lock/expiry.
  const [lockEpoch, bumpLock] = useReducer((x: number) => x + 1, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chatLock = useMemo(() => getChatLockState(me?.id), [me?.id, lockEpoch]);
  useEffect(() => {
    // when the unlock window closes, re-render so locked chats vanish again
    if (chatLock.msLeft == null) return;
    const t = setTimeout(() => bumpLock(), chatLock.msLeft + 250);
    return () => clearTimeout(t);
  }, [chatLock.msLeft]);
  useEffect(() => {
    // relocking closes a locked chat that's still open on screen
    if (!chatLock.unlocked && state.activeChatId && chatLock.lockedIds.includes(state.activeChatId)) {
      openChat(null);
    }
  }, [chatLock.unlocked, chatLock.lockedIds, state.activeChatId, openChat]);
  const chatLockSetup = useCallback(async (passcode: string, currentPasscode?: string) => {
    const meId = meRef.current?.id;
    if (!meId) throw new Error("Sign in first");
    await setupChatLock(meId, passcode, currentPasscode);
    bumpLock();
  }, []);
  const chatLockUnlock = useCallback(async (passcode: string) => {
    const meId = meRef.current?.id;
    if (!meId) return false;
    const ok = await unlockChatLock(meId, passcode);
    if (ok) bumpLock();
    return ok;
  }, []);
  const chatLockNow = useCallback(() => {
    const meId = meRef.current?.id;
    if (!meId) return;
    lockChatLockNow(meId);
    bumpLock();
  }, []);
  const setChatLocked = useCallback((chatId: string, locked: boolean) => {
    const meId = meRef.current?.id;
    if (!meId) return;
    storeChatLocked(meId, chatId, locked);
    bumpLock();
  }, []);
  const setChatLockRelock = useCallback((minutes: number) => {
    const meId = meRef.current?.id;
    if (!meId) return;
    storeRelockMinutes(meId, minutes);
    bumpLock();
  }, []);

  // stories — indexer-hosted (24h ephemeral), signed with the zkLogin key so
  // nobody can post or delete as you. Unlike chat media, story images are
  // public Walrus blobs (a story is a broadcast, not an E2E message).
  const signMsg = useEnokiSignPersonalMessage();
  const listStatus = useCallback(async (): Promise<StatusGroup[]> => {
    const groups = await trpc.statusList.query({ viewer: meRef.current?.id });
    return groups.map((g) => ({
      user: {
        id: g.user.address,
        username: g.user.handle ?? `${g.user.address.slice(0, 6)}…${g.user.address.slice(-4)}`,
        displayName: g.user.displayName ?? g.user.handle ?? undefined,
        avatarUrl: g.user.avatarBlobId ? walrus.urlFor(umbraConfig, g.user.avatarBlobId) : undefined,
      },
      items: g.items.map((s) => ({
        id: s.id,
        userId: s.owner,
        type: s.type,
        content: s.content,
        mediaUrl: s.mediaBlobId ? walrus.urlFor(umbraConfig, s.mediaBlobId) : undefined,
        bg: s.bg ?? undefined,
        createdAt: new Date(s.createdAtMs).toISOString(),
        viewedBy: s.viewedBy,
      })),
      hasUnseen: g.hasUnseen,
    }));
  }, []);
  const postStatus = useCallback(
    async (input: StatusInput) => {
      const meId = meRef.current?.id;
      if (!meId) throw new Error("Sign in first");
      let mediaBlobId: string | null = null;
      if (input.file) {
        const bytes = new Uint8Array(await input.file.arrayBuffer());
        mediaBlobId = (await walrus.upload(umbraConfig, bytes)).blobId;
      }
      const message = {
        owner: meId,
        type: input.type,
        content: input.content,
        mediaBlobId,
        bg: input.bg ?? null,
        timestamp: Date.now(),
      };
      const { signature } = await signMsg(canonicalStatusBytes(message));
      const r = await trpc.statusPost.mutate({ message, signature });
      if (!r.ok) throw new Error("Story didn't go through — try again");
    },
    [signMsg],
  );
  const viewStatus = useCallback(async (statusId: string) => {
    const meId = meRef.current?.id;
    if (!meId) return;
    await trpc.statusView.mutate({ statusId, viewer: meId }).catch(() => {});
  }, []);
  const deleteStatus = useCallback(
    async (statusId: string) => {
      const meId = meRef.current?.id;
      if (!meId) return;
      const message = { owner: meId, statusId, timestamp: Date.now() };
      const { signature } = await signMsg(canonicalStatusDeleteBytes(message));
      await trpc.statusDelete.mutate({ message, signature });
    },
    [signMsg],
  );

  // chosen game (events drive state via the subscription)
  const chosen = useMemo(
    () => ({
      start: (chatId: string, config: ChosenConfig) => messaging.chosenStart(chatId, config),
      tap: (chatId: string) => messaging.chosenTap(chatId),
      pick: (chatId: string, n: number) => messaging.chosenPick(chatId, n),
      next: (chatId: string) => messaging.chosenNext(chatId),
      end: (chatId: string) => messaging.chosenEnd(chatId),
      sync: (chatId: string) => messaging.chosenSync(chatId),
    }),
    [],
  );

  const activeChat = useMemo(
    () => state.chats.find((c) => c.id === state.activeChatId) ?? null,
    [state.chats, state.activeChatId],
  );

  const value: MessagingContext = {
    me,
    ready: Boolean(me),
    state,
    activeChat,
    openChat,
    send,
    startDirect,
    createGroup,
    searchUsers,
    blockUser,
    unblockUser,
    listBlocked,
    reportUser,
    setTyping,
    refreshChats,
    editMessage,
    deleteMessage,
    toggleReaction,
    forwardMessage,
    searchMessages,
    updateGroup,
    addParticipants,
    removeParticipant,
    setAdmin,
    leaveGroup,
    setChatSettings,
    uploadMedia,
    setDisappearing,
    pinMessage,
    listPinned,
    saveMessage,
    unsaveMessage,
    listSaved,
    createPoll,
    votePoll,
    markViewOnce,
    chatLock,
    chatLockSetup,
    chatLockUnlock,
    chatLockNow,
    setChatLocked,
    setChatLockRelock,
    listStatus,
    postStatus,
    viewStatus,
    deleteStatus,
    chosen,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMessaging(): MessagingContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMessaging must be used within <MessagingProvider>");
  return ctx;
}
