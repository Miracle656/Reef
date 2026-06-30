/**
 * Mock messaging backend — the interim implementation of `Messaging`.
 *
 * Persists to localStorage and drives "real-time" via an in-memory event bus.
 * Seeded with a few contacts + conversations so the UI is demoable single-user.
 * Seeded contacts auto-reply so sends feel alive. None of this is real
 * multi-device messaging — that arrives with the Sui adapter.
 *
 * This whole file is throwaway: the onchain port replaces it with sui-adapter.ts.
 */

import type {
  Chat,
  ChatUser,
  ChosenState,
  Me,
  Message,
  Participant,
  Status,
  StatusGroup,
} from "./types";
import type {
  ChosenConfig,
  CreateGroupInput,
  GroupPatch,
  Messaging,
  MessagingEvent,
  MessagingEventHandler,
  SendMessageInput,
  StatusInput,
  UploadResult,
} from "./messaging";

const STORE_KEY = "reef:messages:v1";

interface DB {
  meId: string | null;
  users: ChatUser[];
  chats: Chat[];
  messages: Record<string, Message[]>;
  saved: string[];
  vaultPasscode: string | null;
  statuses: Status[];
  blocked: string[];
}

// Built-in dare/truth pack for the Chosen game (user can swap these).
const CHOSEN_PACK: Record<string, { dares: string[]; truths: string[] }> = {
  mild: {
    dares: ["Do your best dance move 🕺", "Talk in an accent until your next turn", "Send the last photo in your camera roll", "Do 10 push-ups", "Sing the chorus of any song"],
    truths: ["What's your most-used emoji?", "Last thing you searched online?", "Biggest irrational fear?", "Worst haircut you ever had?"],
  },
  spicy: {
    dares: ["Text your crush 'gm'", "Let the group post a story for you", "Do an impression of someone here", "Reveal your screen-time number"],
    truths: ["Who here would you swap lives with?", "Most embarrassing DM you've sent?", "A secret talent nobody knows?"],
  },
};
const packFor = (category: string) => CHOSEN_PACK[category] ?? CHOSEN_PACK.mild!;

const uid = () => Math.random().toString(36).slice(2, 11);
const nowIso = () => new Date().toISOString();
const isBrowser = typeof window !== "undefined";

// ── seed contacts ─────────────────────────────────────────────────────────────
const SEED_USERS: ChatUser[] = [
  { id: "u_amaka", username: "amaka", displayName: "Amaka Obi", bio: "designer · lagos" },
  { id: "u_tunde", username: "tunde", displayName: "Tunde A.", bio: "builds on sui" },
  { id: "u_zara", username: "zara", displayName: "Zara", bio: "gm ☀️" },
  { id: "u_devrel", username: "reef", displayName: "ReeF", bio: "the social layer on sui" },
];

const CANNED_REPLIES = [
  "gm 🐚",
  "for real?",
  "ahh that's clean",
  "send it",
  "on chain soon 👀",
  "lol",
  "say less",
  "let's ship it",
];

export class MockMessaging implements Messaging {
  private db: DB;
  private handlers = new Set<MessagingEventHandler>();
  private me: Me | null = null;
  private vaultUnlocked = false; // session-only; never persisted
  private chosenGames = new Map<string, ChosenState>(); // ephemeral game state

  constructor() {
    this.db = this.load();
  }

  // ── persistence ────────────────────────────────────────────────────────────
  private load(): DB {
    if (isBrowser) {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) {
          const db = JSON.parse(raw) as DB;
          db.saved ??= [];
          db.vaultPasscode ??= null;
          db.statuses ??= [];
          db.blocked ??= [];
          return db;
        }
      } catch {
        /* fall through to fresh */
      }
    }
    return { meId: null, users: [...SEED_USERS], chats: [], messages: {}, saved: [], vaultPasscode: null, statuses: [], blocked: [] };
  }

  private save() {
    if (!isBrowser) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.db));
    } catch {
      /* quota — ignore, it's a mock */
    }
  }

  // ── event bus ────────────────────────────────────────────────────────────────
  subscribe(handler: MessagingEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: MessagingEvent) {
    this.handlers.forEach((h) => h(event));
  }

  // ── identity + seeding ───────────────────────────────────────────────────────
  setCurrentUser(me: Me) {
    this.me = me;
    // register/refresh "me" in the user directory
    const existing = this.db.users.find((u) => u.id === me.id);
    const meUser: ChatUser = {
      id: me.id,
      username: me.username,
      displayName: me.displayName,
      avatarUrl: me.avatarUrl,
    };
    if (existing) Object.assign(existing, meUser);
    else this.db.users.push(meUser);

    if (this.db.meId !== me.id) {
      this.db.meId = me.id;
      this.ensureSeed();
    }
    this.save();
  }

  /** Build a couple of starter conversations the first time a user signs in. */
  private ensureSeed() {
    if (!this.me) return;
    if (this.db.chats.length > 0) return;
    const meId = this.me.id;

    const mkDirect = (other: ChatUser, lines: { from: string; text: string; minsAgo: number }[]): void => {
      const chatId = uid();
      const msgs: Message[] = lines.map((l) => ({
        id: uid(),
        chatId,
        senderId: l.from,
        type: "text",
        content: l.text,
        status: "read",
        createdAt: new Date(Date.now() - l.minsAgo * 60_000).toISOString(),
      }));
      const last = msgs[msgs.length - 1];
      const chat: Chat = {
        id: chatId,
        type: "direct",
        participants: [this.meAsUser(), other],
        createdBy: meId,
        lastMessage: last ?? null,
        lastMessageAt: last?.createdAt,
        unreadCount: 0,
      };
      this.db.chats.push(chat);
      this.db.messages[chatId] = msgs;
    };

    const amaka = this.user("u_amaka")!;
    const tunde = this.user("u_tunde")!;
    const zara = this.user("u_zara")!;
    const devrel = this.user("u_devrel")!;

    mkDirect(devrel, [
      { from: "u_devrel", text: "welcome to ReeF messages 🐚", minsAgo: 60 },
      { from: "u_devrel", text: "this thread lives in the mock today — going on-chain soon.", minsAgo: 59 },
    ]);
    mkDirect(amaka, [
      { from: "u_amaka", text: "did you see the new feed design?", minsAgo: 44 },
      { from: meId, text: "yeah it's gorgeous", minsAgo: 43 },
      { from: "u_amaka", text: "right?? the glass cards 😍", minsAgo: 42 },
    ]);
    mkDirect(tunde, [{ from: "u_tunde", text: "pushing the move contracts tonight", minsAgo: 180 }]);

    // a group
    const gid = uid();
    const gmsgs: Message[] = [
      { id: uid(), chatId: gid, senderId: "u_zara", type: "text", content: "gm builders ☀️", status: "read", createdAt: new Date(Date.now() - 30 * 60_000).toISOString() },
      { id: uid(), chatId: gid, senderId: "u_tunde", type: "text", content: "gm gm", status: "read", createdAt: new Date(Date.now() - 28 * 60_000).toISOString() },
    ];
    this.db.chats.push({
      id: gid,
      type: "group",
      name: "ReeF builders",
      description: "the crew shipping the social layer",
      participants: [this.meAsUser(), amaka, tunde, zara],
      createdBy: meId,
      adminIds: [meId],
      lastMessage: gmsgs[gmsgs.length - 1],
      lastMessageAt: gmsgs[gmsgs.length - 1]!.createdAt,
      unreadCount: 1,
    });
    this.db.messages[gid] = gmsgs;

    // a seed story so the stories bar isn't empty
    this.db.statuses.push({
      id: uid(),
      userId: "u_amaka",
      type: "text",
      content: "shipping all weekend ⚡",
      bg: "#0a84ff",
      createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      viewedBy: [],
    });
  }

  private meAsUser(): ChatUser {
    const m = this.me!;
    return { id: m.id, username: m.username, displayName: m.displayName, avatarUrl: m.avatarUrl };
  }

  private user(id: string): ChatUser | undefined {
    return this.db.users.find((u) => u.id === id);
  }

  private requireMe(): Me {
    if (!this.me) throw new Error("setCurrentUser() must be called before using messaging");
    return this.me;
  }

  // ── chats ────────────────────────────────────────────────────────────────────
  async listChats(): Promise<Chat[]> {
    this.requireMe();
    return this.db.chats
      .filter((c) => !c.vaulted)
      .filter((c) => !(c.type === "direct" && c.participants.some((p) => p.id !== this.me?.id && this.db.blocked.includes(p.id))))
      .slice()
      .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  }

  async getChat(chatId: string): Promise<Chat | null> {
    return this.db.chats.find((c) => c.id === chatId) ?? null;
  }

  async createDirect(participantId: string): Promise<Chat> {
    const me = this.requireMe();
    const existing = this.db.chats.find(
      (c) => c.type === "direct" && c.participants.some((p) => p.id === participantId),
    );
    if (existing) return existing;

    const other = this.user(participantId);
    if (!other) throw new Error("user not found");
    const chat: Chat = {
      id: uid(),
      type: "direct",
      participants: [this.meAsUser(), other],
      createdBy: me.id,
      lastMessage: null,
      unreadCount: 0,
    };
    this.db.chats.unshift(chat);
    this.db.messages[chat.id] = [];
    this.save();
    this.emit({ type: "chat_created", chat });
    return chat;
  }

  async createGroup(input: CreateGroupInput): Promise<Chat> {
    const me = this.requireMe();
    const members = input.participantIds
      .map((id) => this.user(id))
      .filter((u): u is ChatUser => Boolean(u));
    const chat: Chat = {
      id: uid(),
      type: "group",
      name: input.name,
      description: input.description,
      avatarUrl: input.avatarUrl,
      participants: [this.meAsUser(), ...members],
      createdBy: me.id,
      adminIds: [me.id],
      lastMessage: null,
      unreadCount: 0,
    };
    this.db.chats.unshift(chat);
    this.db.messages[chat.id] = [];
    this.save();
    this.emit({ type: "chat_created", chat });
    return chat;
  }

  async markRead(chatId: string): Promise<void> {
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.unreadCount = 0;
      chat.mentioned = false;
      this.save();
    }
  }

  // ── messages ─────────────────────────────────────────────────────────────────
  async listMessages(chatId: string): Promise<{ messages: Message[]; nextCursor: string | null }> {
    const messages = (this.db.messages[chatId] ?? [])
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => this.hydrate(m));
    return { messages, nextCursor: null };
  }

  /** Attach the sender's profile to a stored message for rendering. */
  private hydrate(m: Message): Message {
    if (m.sender) return m;
    const u = this.user(m.senderId);
    return u ? { ...m, sender: u } : m;
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const me = this.requireMe();
    const msg: Message = {
      id: uid(),
      chatId: input.chatId,
      senderId: me.id,
      type: input.type ?? "text",
      content: input.content,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      replyToId: input.replyToId,
      isWhisper: input.isWhisper,
      isForwarded: input.isForwarded,
      viewOnce: input.viewOnce,
      mentionIds: input.mentionIds,
      audienceIds: input.audienceIds,
      clientId: input.clientId,
      status: "sent",
      createdAt: nowIso(),
      sender: this.meAsUser(),
    };
    const chat = this.db.chats.find((c) => c.id === input.chatId);
    if (chat?.disappearingSeconds) {
      msg.expiresAt = new Date(Date.now() + chat.disappearingSeconds * 1000).toISOString();
    }
    (this.db.messages[input.chatId] ??= []).push(msg);
    if (chat) {
      chat.lastMessage = msg;
      chat.lastMessageAt = msg.createdAt;
    }
    this.save();

    // simulate the other side: delivered → read → maybe a reply
    this.simulateRemote(input.chatId, msg);
    return msg;
  }

  private simulateRemote(chatId: string, sent: Message) {
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (!chat) return;
    setTimeout(() => {
      sent.status = "delivered";
      this.emit({ type: "delivered", chatId, messageId: sent.id });
    }, 600);
    setTimeout(() => {
      sent.status = "read";
      this.emit({ type: "read", chatId, userId: "remote" });
    }, 1400);

    // only direct chats with a seeded contact auto-reply
    const other = chat.participants.find((p) => p.id !== this.me?.id);
    if (chat.type !== "direct" || !other || !other.id.startsWith("u_")) return;

    setTimeout(() => this.emit({ type: "typing", chatId, userId: other.id, username: other.username, isTyping: true }), 1800);
    setTimeout(() => {
      this.emit({ type: "typing", chatId, userId: other.id, username: other.username, isTyping: false });
      const reply: Message = {
        id: uid(),
        chatId,
        senderId: other.id,
        type: "text",
        content: CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)] ?? "👍",
        status: "sent",
        createdAt: nowIso(),
        sender: other,
      };
      (this.db.messages[chatId] ??= []).push(reply);
      chat.lastMessage = reply;
      chat.lastMessageAt = reply.createdAt;
      this.save();
      this.emit({ type: "message", message: reply, isOwn: false, mentionsMe: false });
    }, 3200);
  }

  // ── message mutations ────────────────────────────────────────────────────────
  private findMessage(messageId: string): { chatId: string; msg: Message } | null {
    for (const [chatId, list] of Object.entries(this.db.messages)) {
      const msg = list.find((m) => m.id === messageId);
      if (msg) return { chatId, msg };
    }
    return null;
  }

  async editMessage(messageId: string, content: string): Promise<void> {
    const hit = this.findMessage(messageId);
    if (!hit) return;
    hit.msg.content = content;
    hit.msg.isEdited = true;
    hit.msg.editedAt = nowIso();
    this.save();
    this.emit({ type: "message_edited", chatId: hit.chatId, messageId, content, editedAt: hit.msg.editedAt });
  }

  async deleteMessage(messageId: string): Promise<void> {
    const hit = this.findMessage(messageId);
    if (!hit) return;
    hit.msg.isDeleted = true;
    hit.msg.content = "";
    this.save();
    this.emit({ type: "message_deleted", chatId: hit.chatId, messageId });
  }

  async addReaction(messageId: string, emoji: string): Promise<void> {
    const me = this.requireMe();
    const hit = this.findMessage(messageId);
    if (!hit) return;
    hit.msg.reactions ??= [];
    if (!hit.msg.reactions.some((r) => r.userId === me.id && r.emoji === emoji)) {
      hit.msg.reactions.push({ messageId, userId: me.id, emoji });
      this.save();
    }
    this.emit({ type: "reaction_added", chatId: hit.chatId, messageId, userId: me.id, emoji });
  }

  async removeReaction(messageId: string, emoji: string): Promise<void> {
    const me = this.requireMe();
    const hit = this.findMessage(messageId);
    if (!hit?.msg.reactions) return;
    hit.msg.reactions = hit.msg.reactions.filter((r) => !(r.userId === me.id && r.emoji === emoji));
    this.save();
    this.emit({ type: "reaction_removed", chatId: hit.chatId, messageId, userId: me.id, emoji });
  }

  async searchMessages(chatId: string, query: string): Promise<Message[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (this.db.messages[chatId] ?? [])
      .filter((m) => !m.isDeleted && m.content.toLowerCase().includes(q))
      .map((m) => this.hydrate(m))
      .reverse();
  }

  // ── group / chat management ──────────────────────────────────────────────────
  private patchChat(chatId: string, patch: Partial<Chat>): Chat {
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (!chat) throw new Error("chat not found");
    Object.assign(chat, patch);
    this.save();
    this.emit({ type: "chat_updated", chatId });
    return chat;
  }

  async updateGroup(chatId: string, patch: GroupPatch): Promise<Chat> {
    return this.patchChat(chatId, patch);
  }

  async addParticipants(chatId: string, userIds: string[]): Promise<Chat> {
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (!chat) throw new Error("chat not found");
    const have = new Set(chat.participants.map((p) => p.id));
    const add = userIds.map((id) => this.user(id)).filter((u): u is ChatUser => Boolean(u) && !have.has(u!.id));
    chat.participants = [...chat.participants, ...add];
    this.save();
    this.emit({ type: "chat_updated", chatId });
    return chat;
  }

  async removeParticipant(chatId: string, userId: string): Promise<Chat> {
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (!chat) throw new Error("chat not found");
    chat.participants = chat.participants.filter((p) => p.id !== userId);
    chat.adminIds = (chat.adminIds ?? []).filter((id) => id !== userId);
    this.save();
    this.emit({ type: "chat_updated", chatId });
    return chat;
  }

  async setAdmin(chatId: string, userId: string, admin: boolean): Promise<Chat> {
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (!chat) throw new Error("chat not found");
    const set = new Set(chat.adminIds ?? []);
    if (admin) set.add(userId);
    else set.delete(userId);
    chat.adminIds = [...set];
    this.save();
    this.emit({ type: "chat_updated", chatId });
    return chat;
  }

  async leaveGroup(chatId: string): Promise<void> {
    const me = this.requireMe();
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (!chat) return;
    chat.participants = chat.participants.filter((p) => p.id !== me.id);
    chat.adminIds = (chat.adminIds ?? []).filter((id) => id !== me.id);
    // for the mock, leaving removes the chat from the local view
    this.db.chats = this.db.chats.filter((c) => c.id !== chatId);
    delete this.db.messages[chatId];
    this.save();
  }

  async setChatSettings(chatId: string, settings: { muted?: boolean; archived?: boolean }): Promise<void> {
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (!chat) return;
    if (settings.muted !== undefined) chat.muted = settings.muted;
    if (settings.archived !== undefined) chat.archived = settings.archived;
    this.save();
  }

  // ── pins / saved / polls / disappearing / view-once ──────────────────────────
  async setDisappearing(chatId: string, seconds: number): Promise<void> {
    this.patchChat(chatId, { disappearingSeconds: seconds });
  }

  async pinMessage(messageId: string, pinned: boolean): Promise<void> {
    const hit = this.findMessage(messageId);
    if (!hit) return;
    hit.msg.isPinned = pinned;
    this.save();
    this.emit({ type: "message_pinned", chatId: hit.chatId, messageId, isPinned: pinned });
  }

  async listPinned(chatId: string): Promise<Message[]> {
    return (this.db.messages[chatId] ?? []).filter((m) => m.isPinned && !m.isDeleted).map((m) => this.hydrate(m));
  }

  async saveMessage(messageId: string): Promise<void> {
    if (!this.db.saved.includes(messageId)) this.db.saved.push(messageId);
    this.save();
  }

  async unsaveMessage(messageId: string): Promise<void> {
    this.db.saved = this.db.saved.filter((id) => id !== messageId);
    this.save();
  }

  async listSaved(): Promise<Message[]> {
    return this.db.saved
      .map((id) => this.findMessage(id)?.msg)
      .filter((m): m is Message => Boolean(m))
      .map((m) => this.hydrate(m));
  }

  async createPoll(chatId: string, question: string, options: string[], allowMultiple: boolean): Promise<Message> {
    const me = this.requireMe();
    const msg: Message = {
      id: uid(),
      chatId,
      senderId: me.id,
      type: "poll",
      content: question,
      status: "sent",
      createdAt: nowIso(),
      sender: this.meAsUser(),
      poll: {
        id: uid(),
        question,
        allowMultiple,
        options: options.map((text) => ({ text, votes: 0 })),
        totalVoters: 0,
        myVotes: [],
      },
    };
    (this.db.messages[chatId] ??= []).push(msg);
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.lastMessage = msg;
      chat.lastMessageAt = msg.createdAt;
    }
    this.save();
    return msg;
  }

  async votePoll(messageId: string, optionIndex: number): Promise<void> {
    const hit = this.findMessage(messageId);
    const poll = hit?.msg.poll;
    if (!poll) return;
    const opt = poll.options[optionIndex];
    if (!opt) return;
    const had = poll.myVotes.includes(optionIndex);
    if (poll.allowMultiple) {
      if (had) {
        opt.votes = Math.max(0, opt.votes - 1);
        poll.myVotes = poll.myVotes.filter((i) => i !== optionIndex);
      } else {
        opt.votes++;
        poll.myVotes.push(optionIndex);
      }
    } else {
      poll.myVotes.forEach((i) => {
        const o = poll.options[i];
        if (o) o.votes = Math.max(0, o.votes - 1);
      });
      poll.myVotes = had ? [] : [optionIndex];
      if (!had) opt.votes++;
    }
    poll.totalVoters = poll.myVotes.length ? 1 : 0;
    this.save();
    this.emit({ type: "poll_voted", chatId: hit!.chatId, messageId, poll });
  }

  async markViewOnce(messageId: string): Promise<void> {
    const hit = this.findMessage(messageId);
    if (!hit) return;
    hit.msg.viewOnceViewed = true;
    this.save();
  }

  // ── the vault ────────────────────────────────────────────────────────────────
  async vaultStatus(): Promise<{ hasPasscode: boolean; unlocked: boolean }> {
    return { hasPasscode: Boolean(this.db.vaultPasscode), unlocked: this.vaultUnlocked };
  }

  async vaultSetup(passcode: string, currentPasscode?: string): Promise<void> {
    if (this.db.vaultPasscode && this.db.vaultPasscode !== currentPasscode) {
      throw new Error("Current passcode is incorrect");
    }
    this.db.vaultPasscode = passcode;
    this.vaultUnlocked = true;
    this.save();
  }

  async vaultUnlock(passcode: string): Promise<boolean> {
    const ok = this.db.vaultPasscode === passcode;
    if (ok) this.vaultUnlocked = true;
    return ok;
  }

  lockVault(): void {
    this.vaultUnlocked = false;
  }

  async listVaultChats(): Promise<Chat[]> {
    if (!this.vaultUnlocked) return [];
    return this.db.chats.filter((c) => c.vaulted);
  }

  async setChatVaulted(chatId: string, vaulted: boolean): Promise<void> {
    const chat = this.db.chats.find((c) => c.id === chatId);
    if (!chat) return;
    chat.vaulted = vaulted;
    this.save();
  }

  // ── stories / status ─────────────────────────────────────────────────────────
  async listStatus(): Promise<StatusGroup[]> {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const live = this.db.statuses.filter((s) => new Date(s.createdAt).getTime() > cutoff);
    const meId = this.me?.id;
    const byUser = new Map<string, Status[]>();
    for (const s of live) (byUser.get(s.userId) ?? byUser.set(s.userId, []).get(s.userId)!).push(s);
    const groups: StatusGroup[] = [];
    for (const [userId, items] of byUser) {
      const user = this.user(userId);
      if (!user) continue;
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      groups.push({ user, items, hasUnseen: items.some((s) => !(s.viewedBy ?? []).includes(meId ?? "")) });
    }
    // my own group first
    return groups.sort((a, b) => (a.user.id === meId ? -1 : b.user.id === meId ? 1 : 0));
  }

  async postStatus(input: StatusInput): Promise<void> {
    const me = this.requireMe();
    this.db.statuses.push({
      id: uid(),
      userId: me.id,
      type: input.type,
      content: input.content,
      mediaUrl: input.mediaUrl,
      bg: input.bg,
      createdAt: nowIso(),
      viewedBy: [],
    });
    this.save();
  }

  async viewStatus(statusId: string): Promise<void> {
    const me = this.requireMe();
    const s = this.db.statuses.find((x) => x.id === statusId);
    if (s && !(s.viewedBy ?? []).includes(me.id)) {
      s.viewedBy = [...(s.viewedBy ?? []), me.id];
      this.save();
    }
  }

  async deleteStatus(statusId: string): Promise<void> {
    this.db.statuses = this.db.statuses.filter((s) => s.id !== statusId);
    this.save();
  }

  // ── the Chosen game (simplified, single-user-friendly) ───────────────────────
  private emitChosen(game: ChosenState) {
    this.chosenGames.set(game.chatId, game);
    this.emit({ type: "chosen_state", game });
  }

  async chosenStart(chatId: string, config: ChosenConfig): Promise<void> {
    const me = this.requireMe();
    const chat = this.db.chats.find((c) => c.id === chatId);
    const others = (chat?.participants ?? []).filter((p) => p.id !== me.id).slice(0, 3).map((p) => p.id);
    const pack = packFor(config.category);
    this.emitChosen({
      chatId,
      phase: "arming",
      mode: config.mode,
      initiatorId: me.id,
      category: config.category,
      players: [me.id, ...others],
      tapped: [],
      daresLeft: pack.dares.length,
      truthsLeft: pack.truths.length,
      chosenId: null,
      round: 1,
      revealedText: null,
      revealedKind: null,
      pollEndsAt: null,
    });
  }

  async chosenJoin(chatId: string): Promise<void> {
    const me = this.requireMe();
    const g = this.chosenGames.get(chatId);
    if (g && !g.players.includes(me.id)) this.emitChosen({ ...g, players: [...g.players, me.id] });
  }

  async chosenLeave(chatId: string): Promise<void> {
    const me = this.requireMe();
    const g = this.chosenGames.get(chatId);
    if (g) this.emitChosen({ ...g, players: g.players.filter((p) => p !== me.id), tapped: g.tapped.filter((p) => p !== me.id) });
  }

  async chosenTap(chatId: string): Promise<void> {
    const g = this.chosenGames.get(chatId);
    if (!g || g.phase !== "arming") return;
    // the user taps; bots tap instantly so a solo game still resolves
    this.emitChosen({ ...g, tapped: [...g.players] });
    setTimeout(() => {
      const cur = this.chosenGames.get(chatId);
      if (!cur || cur.phase !== "arming") return;
      this.emitChosen({ ...cur, phase: "pulsing" });
      setTimeout(() => {
        const c2 = this.chosenGames.get(chatId);
        if (!c2 || c2.phase !== "pulsing") return;
        const chosenId = c2.players[Math.floor(Math.random() * c2.players.length)] ?? c2.players[0]!;
        this.emitChosen({ ...c2, phase: "revealed", chosenId, revealedText: null, revealedKind: null });
      }, 1600);
    }, 500);
  }

  async chosenPick(chatId: string, n: number): Promise<void> {
    const g = this.chosenGames.get(chatId);
    if (!g || g.phase !== "revealed") return;
    const pack = packFor(g.category);
    const kind: "dare" | "truth" = g.mode === "both" ? (Math.random() < 0.5 ? "dare" : "truth") : g.mode;
    const list = kind === "dare" ? pack.dares : pack.truths;
    const text = list[n % list.length] ?? list[0]!;
    this.emitChosen({
      ...g,
      revealedText: text,
      revealedKind: kind,
      daresLeft: kind === "dare" ? Math.max(0, g.daresLeft - 1) : g.daresLeft,
      truthsLeft: kind === "truth" ? Math.max(0, g.truthsLeft - 1) : g.truthsLeft,
    });
  }

  async chosenNext(chatId: string): Promise<void> {
    const g = this.chosenGames.get(chatId);
    if (!g) return;
    this.emitChosen({ ...g, phase: "arming", round: g.round + 1, tapped: [], chosenId: null, revealedText: null, revealedKind: null });
  }

  async chosenEnd(chatId: string): Promise<void> {
    this.chosenGames.delete(chatId);
    this.emit({ type: "chosen_ended", chatId });
  }

  async chosenSync(chatId: string): Promise<void> {
    const g = this.chosenGames.get(chatId);
    if (g) this.emit({ type: "chosen_state", game: g });
  }

  setTyping(): void {
    // self-typing in a single-user mock is a no-op; the seam exists for the
    // onchain adapter to broadcast presence.
  }

  // ── people ───────────────────────────────────────────────────────────────────
  async searchUsers(query: string): Promise<Participant[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const meId = this.me?.id;
    return this.db.users.filter(
      (u) =>
        u.id !== meId &&
        (u.username.toLowerCase().includes(q) || (u.displayName ?? "").toLowerCase().includes(q)),
    );
  }

  async blockUser(userId: string): Promise<void> {
    if (!this.db.blocked.includes(userId)) this.db.blocked.push(userId);
    this.save();
  }

  async unblockUser(userId: string): Promise<void> {
    this.db.blocked = this.db.blocked.filter((id) => id !== userId);
    this.save();
  }

  async listBlocked(): Promise<Participant[]> {
    return this.db.blocked.map((id) => this.user(id)).filter((u): u is ChatUser => Boolean(u));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async reportUser(_userId: string, _reason: string, _chatId?: string): Promise<void> {
    // mock: a report is a no-op. The onchain/backend adapter records it.
  }

  // ── media ────────────────────────────────────────────────────────────────────
  async uploadMedia(file: File): Promise<UploadResult> {
    // data URL so it survives reload in the mock (real adapter → Walrus blob).
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    return { url, name: file.name, size: file.size, mimeType: file.type };
  }
}
