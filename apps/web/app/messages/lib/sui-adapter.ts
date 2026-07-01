/**
 * ── ON-CHAIN MESSAGING ADAPTER (Sui Stack Messaging) ─────────────────────────
 *
 * Implements the `Messaging` interface on `@mysten/sui-stack-messaging`:
 *   - groups/DMs        on-chain (createAndShareGroup, Enoki-sponsored)
 *   - message transport relayer (sendMessage/getMessages), signed by EnokiSigner
 *   - discovery         Sui GraphQL MemberAdded/Removed events
 *   - identity          the user's zkLogin address (via runtime.me)
 *
 * The React-only bits (Enoki signer, gasless sponsor) are injected by
 * `provider.tsx` through `runtime.ts` — this file stays hook-free.
 *
 * v1 scope: DMs + groups create/send/receive/list. Rich features (reactions,
 * polls, pins, whisper, stories, vault, Chosen) are safe no-ops or throw until
 * ported — see the SECONDARY / UNSUPPORTED sections. Real-time is polling for now
 * (swap to client.messaging.subscribe later).
 */

import { TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG, messagingPermissionTypes } from "@mysten/sui-stack-messaging";
import { TESTNET_SUI_GROUPS_PACKAGE_CONFIG, permissionTypes } from "@mysten/sui-groups";
import { requireRuntime, getMessagingRuntime, type MessagingRuntime } from "./runtime";
import type {
  Chat,
  Me,
  Message,
  MessageType,
  Participant,
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
import { trpc } from "@/lib/trpc";
import { walrus } from "@umbra/core";
import { umbraConfig } from "@/lib/config";

// ── message envelope (ReeF's rich model, E2EE inside the SDK `text`) ──────────

interface Envelope {
  v: 1;
  type: MessageType;
  content: string;
  replyToId?: string;
  mentionIds?: string[];
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  isForwarded?: boolean;
  isWhisper?: boolean;
  viewOnce?: boolean;
  clientId?: string;
}

function encodeEnvelope(input: SendMessageInput): string {
  const env: Envelope = {
    v: 1,
    type: input.type ?? "text",
    content: input.content,
    replyToId: input.replyToId,
    mentionIds: input.mentionIds,
    fileUrl: input.fileUrl,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    isForwarded: input.isForwarded,
    isWhisper: input.isWhisper,
    viewOnce: input.viewOnce,
    clientId: input.clientId,
  };
  return JSON.stringify(env);
}

function decodeEnvelope(text: string): Partial<Envelope> {
  try {
    const p = JSON.parse(text) as Envelope;
    if (p && typeof p === "object" && p.v === 1) return p;
  } catch {
    /* plain text (non-ReeF sender) */
  }
  return { type: "text", content: text };
}

// SDK DecryptedMessage → ReeF Message
interface DecodedSdkMessage {
  messageId: string;
  groupId: string;
  order: number;
  text: string;
  senderAddress: string;
  createdAt: number;
  isEdited: boolean;
  isDeleted: boolean;
}

function toMessage(chatId: string, dm: DecodedSdkMessage): Message {
  const env = decodeEnvelope(dm.text);
  return {
    id: dm.messageId,
    chatId,
    senderId: dm.senderAddress,
    type: env.type ?? "text",
    content: dm.isDeleted ? "" : env.content ?? dm.text,
    replyToId: env.replyToId,
    mentionIds: env.mentionIds,
    fileUrl: env.fileUrl,
    fileName: env.fileName,
    fileSize: env.fileSize,
    mimeType: env.mimeType,
    isForwarded: env.isForwarded,
    isWhisper: env.isWhisper,
    viewOnce: env.viewOnce,
    isDeleted: dm.isDeleted,
    isEdited: dm.isEdited,
    status: "delivered",
    clientId: env.clientId,
    // SDK createdAt is unix SECONDS; JS Date wants ms. Guard in case a backend
    // ever returns ms already.
    createdAt: new Date(dm.createdAt < 1e12 ? dm.createdAt * 1000 : dm.createdAt).toISOString(),
  };
}

// ── local group store (groupId ↔ uuid ↔ participants) ─────────────────────────
// The SDK has no listGroups; we cache what we create/discover. Chat.id === uuid.

interface StoredGroup {
  uuid: string;
  groupId: string;
  name: string;
  type: "direct" | "group";
  participantIds: string[];
  /** Resolved ReeF profiles for the human participants (handle/avatar). */
  resolved?: Participant[];
  createdAt: number;
}

function storeKey(me: string): string {
  return `reef:msg-groups:v6:${me.toLowerCase()}`;
}

function readStore(me: string): StoredGroup[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(storeKey(me)) ?? "[]") as StoredGroup[];
  } catch {
    return [];
  }
}

function writeStore(me: string, groups: StoredGroup[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storeKey(me), JSON.stringify(groups));
  } catch {
    /* quota */
  }
}

function upsertGroup(me: string, g: StoredGroup): void {
  const all = readStore(me);
  const i = all.findIndex((x) => x.uuid === g.uuid);
  if (i >= 0) all[i] = { ...all[i], ...g };
  else all.push(g);
  writeStore(me, all);
}

// ── delegate membership (the relayer authorizes the delegate, not zkLogin) ────

function grantsKey(me: string): string {
  return `reef:msg-delegate-grants:v6:${me.toLowerCase()}`;
}
function readGrants(me: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(grantsKey(me)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function markGranted(me: string, groupId: string): void {
  if (typeof window === "undefined") return;
  const s = readGrants(me);
  s.add(groupId);
  try {
    window.localStorage.setItem(grantsKey(me), JSON.stringify([...s]));
  } catch {
    /* quota */
  }
}

function unmarkGranted(me: string, groupId: string): void {
  if (typeof window === "undefined") return;
  const s = readGrants(me);
  if (!s.delete(groupId)) return;
  try {
    window.localStorage.setItem(grantsKey(me), JSON.stringify([...s]));
  } catch {
    /* quota */
  }
}

// Groups our delegate can't join (e.g. orphaned groups where we lack
// PermissionsAdmin) — hidden from the list so they don't clutter.
function skipKey(me: string): string {
  return `reef:msg-skip:v6:${me.toLowerCase()}`;
}
function readSkip(me: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(skipKey(me)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function markSkip(me: string, groupId: string): void {
  if (typeof window === "undefined") return;
  const s = readSkip(me);
  s.add(groupId);
  try {
    window.localStorage.setItem(skipKey(me), JSON.stringify([...s]));
  } catch {
    /* quota */
  }
}
function unmarkSkip(me: string, groupId: string): void {
  if (typeof window === "undefined") return;
  const s = readSkip(me);
  if (!s.delete(groupId)) return;
  try {
    window.localStorage.setItem(skipKey(me), JSON.stringify([...s]));
  } catch {
    /* quota */
  }
}

const MSG_PERMS = messagingPermissionTypes(TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG.originalPackageId);
const GRP_PERMS = permissionTypes(TESTNET_SUI_GROUPS_PACKAGE_CONFIG.originalPackageId);

/**
 * Grant this device's delegate Reader+Sender on a group (the user's zkLogin admin
 * signs, Enoki-sponsored). Idempotent per-device via localStorage. This both
 * repairs orphaned groups and is the "join" step for the non-creator side.
 *
 * NOTE: the relayer syncs on-chain membership from checkpoints, so there's a few-
 * second lag after granting before reads/sends are authorized.
 */
/** Does the group object already exist on-chain (and am I in it)? Reads only. */
async function groupExists(rt: MessagingRuntime, groupId: string): Promise<boolean> {
  try {
    return await rt.client.groups.view.isMember({ groupId, member: rt.me.id });
  } catch {
    return false; // object not found → doesn't exist yet
  }
}

/**
 * Grant `member` only the permissions they DON'T already hold — checking on-chain
 * with `hasPermission` first. Idempotent: re-granting an existing permission aborts
 * (`vec_set::insert`), so we must skip already-held ones. No-op if nothing missing.
 */
async function grantMissing(rt: MessagingRuntime, groupId: string, member: string, perms: string[]): Promise<void> {
  const missing: string[] = [];
  for (const p of perms) {
    try {
      if (!(await rt.client.groups.view.hasPermission({ groupId, member, permissionType: p }))) missing.push(p);
    } catch {
      missing.push(p);
    }
  }
  if (missing.length === 0) return;
  const tx = rt.client.groups.tx.grantPermissions({ groupId, member, permissionTypes: missing });
  try {
    await rt.sponsorExecute(tx);
  } catch (e) {
    // Tolerate redundant grants (stale reads): if the member actually holds all
    // the "missing" perms now, it was already granted — succeed. Otherwise it's a
    // real failure (e.g. we lack PermissionsAdmin) — rethrow.
    for (const p of missing) {
      const has = await rt.client.groups.view.hasPermission({ groupId, member, permissionType: p }).catch(() => false);
      if (!has) throw e;
    }
    console.warn("[reef-msg] grant was redundant (perms already present) — continuing");
  }
}

/** Ensure my delegate holds Reader+Sender on a group (idempotent). */
async function ensureDelegateMembership(rt: MessagingRuntime, groupId: string): Promise<void> {
  if (readGrants(rt.me.id).has(groupId)) return;
  await grantMissing(rt, groupId, rt.delegateAddress, [MSG_PERMS.MessagingReader, MSG_PERMS.MessagingSender]);
  markGranted(rt.me.id, groupId);
}

/**
 * Map a relayer sender address (always a *delegate* keypair) back to a social
 * identity so ownership + display are right:
 *  - my delegate      → me (so my messages render as mine)
 *  - a DM's other delegate → the other participant's zkLogin address
 *  - otherwise (group) → the raw address (best-effort until we map more)
 */
function resolveSenderId(rt: MessagingRuntime, group: StoredGroup | undefined, sender: string): string {
  if (sender.toLowerCase() === rt.delegateAddress.toLowerCase()) return rt.me.id;
  if (group && group.type === "direct") {
    const other = group.participantIds.find((p) => p.toLowerCase() !== rt.me.id.toLowerCase());
    if (other) return other;
  }
  return sender;
}

// ── deterministic DM uuid (both parties derive the same one) ──────────────────

function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hash128Hex(input: string): string {
  return [0, 1, 2, 3].map((s) => fnv1a32(`${input}|${s}`).toString(16).padStart(8, "0")).join("");
}

/** RFC-4122 v8 UUID, deterministic on the sorted address pair. */
function deriveDirectUuid(a: string, b: string): string {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
  const hex = hash128Hex(`reef-dm-v6#${x}#${y}`);
  const u = hex.slice(0, 12) + "8" + hex.slice(13, 16) + "a" + hex.slice(17, 32);
  return [u.slice(0, 8), u.slice(8, 12), u.slice(12, 16), u.slice(16, 20), u.slice(20, 32)].join("-");
}

function shortId(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function participantFromAddress(addr: string): Participant {
  return { id: addr, username: shortId(addr) };
}

function meUser(me: Me): Participant {
  return { id: me.id, username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl };
}

/** The ChatUser for a message sender (resolved profile → handle/avatar in bubbles). */
function senderUserFor(g: StoredGroup, me: Me, senderId: string): Participant {
  if (senderId.toLowerCase() === me.id.toLowerCase()) return meUser(me);
  return g.resolved?.find((p) => p.id.toLowerCase() === senderId.toLowerCase()) ?? participantFromAddress(senderId);
}

function chatFromStored(g: StoredGroup, me: Me): Chat {
  // Prefer resolved ReeF profiles (handle/avatar); fall back to short address.
  const participants: Participant[] = g.resolved?.length
    ? g.resolved.map((p) => (p.id.toLowerCase() === me.id.toLowerCase() ? meUser(me) : p))
    : g.participantIds.map((p) => (p.toLowerCase() === me.id.toLowerCase() ? meUser(me) : participantFromAddress(p)));
  return {
    id: g.uuid,
    type: g.type,
    name: g.type === "group" ? g.name || undefined : undefined,
    participants,
    createdBy: g.participantIds[0],
    lastMessageAt: new Date(g.createdAt).toISOString(),
  };
}

/** The non-me participant of a DM (its counterparty), lowercased. */
function directPeerId(c: Chat, meId: string): string | undefined {
  return c.participants.find((p) => p.id.toLowerCase() !== meId.toLowerCase())?.id.toLowerCase();
}

/**
 * Collapse multiple DM groups with the SAME person into one chat. Repeated
 * testing (and pre-v6 delegate churn) can leave several on-chain groups for one
 * address pair; without this the sidebar shows the same person N times ("kweku /
 * No messages yet"). We keep the "liveliest" one — a group with an actual last
 * message beats an empty one, newer beats older. Named groups are never merged.
 */
function dedupeDirects(chats: Chat[], meId: string): Chat[] {
  const rank = (c: Chat): string => `${c.lastMessage ? 1 : 0}:${c.lastMessageAt ?? ""}`;
  const bestByPeer = new Map<string, Chat>();
  const out: Chat[] = [];
  for (const c of chats) {
    const peer = c.type === "direct" ? directPeerId(c, meId) : undefined;
    if (!peer) {
      out.push(c); // group chat, or a DM we can't resolve a peer for
      continue;
    }
    const prev = bestByPeer.get(peer);
    if (!prev || rank(c) > rank(prev)) bestByPeer.set(peer, c);
  }
  return [...out, ...bestByPeer.values()];
}

// ── profile resolution (address → ReeF handle/avatar) ─────────────────────────

const profileCache = new Map<string, Participant | null>();

async function resolveProfile(address: string): Promise<Participant | null> {
  const key = address.toLowerCase();
  if (profileCache.has(key)) return profileCache.get(key)!;
  let user: Participant | null = null;
  try {
    const p = await trpc.profileByAddress.query({ address });
    if (p) {
      user = {
        id: p.owner,
        username: p.handle,
        displayName: p.displayName ?? undefined,
        avatarUrl: p.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : undefined,
      };
    }
  } catch {
    /* indexer unreachable / not found */
  }
  profileCache.set(key, user);
  return user;
}

/**
 * Resolve a group's *human* participants (zkLogin addresses that have a ReeF
 * profile — delegates + system objects have none, so they drop out) and detect
 * DM vs group by human count. Enumerates on-chain members for discovered groups.
 */
async function enrichGroup(
  rt: MessagingRuntime,
  g: StoredGroup,
  me: Me,
): Promise<{ participants: Participant[]; type: "direct" | "group" } | null> {
  const candidates = new Set<string>(g.participantIds.map((a) => a.toLowerCase()));
  if (candidates.size <= 1) {
    try {
      const res = await rt.client.groups.view.getMembers({ groupId: g.groupId, exhaustive: true });
      for (const m of res.members) candidates.add(m.address.toLowerCase());
    } catch {
      return null; // can't enumerate — keep existing store values
    }
  }
  const meLc = me.id.toLowerCase();
  const humans: Participant[] = [meUser(me)];
  const seen = new Set([meLc]);
  for (const addr of candidates) {
    if (seen.has(addr)) continue;
    seen.add(addr);
    const u = await resolveProfile(addr);
    if (u) humans.push(u);
  }
  const peers = humans.length - 1;
  // A named group stays a group; otherwise 1 human peer = DM, more = group.
  const type: "direct" | "group" = g.name ? "group" : peers === 1 ? "direct" : peers > 1 ? "group" : g.type;
  return { participants: humans, type };
}

// ── GraphQL discovery (MemberAdded / MemberRemoved for my address) ────────────

const DISCOVER_QUERY = `
  query DiscoverGroups($eventType: String!, $cursor: String) {
    events(filter: { type: $eventType }, first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { contents { json } }
    }
  }
`;

async function discoverGroupIds(): Promise<string[]> {
  const rt = getMessagingRuntime();
  if (!rt) return [];
  const me = rt.me.id.toLowerCase();
  const addedType = rt.client.groups.bcs.MemberAdded.name;
  const removedType = rt.client.groups.bcs.MemberRemoved.name;

  async function pageAll(eventType: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const res: unknown = await rt!.graphqlClient.query({
        query: DISCOVER_QUERY as never,
        variables: { eventType, cursor },
      });
      const data = (res as { data?: { events?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<{ contents: { json: { group_id: string; member: string } } | null }> } } }).data;
      const events = data?.events;
      if (!events) break;
      for (const n of events.nodes) {
        const j = n.contents?.json;
        if (j && j.member.toLowerCase() === me) ids.push(j.group_id);
      }
      if (!events.pageInfo.hasNextPage || !events.pageInfo.endCursor) break;
      cursor = events.pageInfo.endCursor;
    }
    return ids;
  }

  const [added, removed] = await Promise.all([pageAll(addedType), pageAll(removedType)]);
  const net = new Map<string, number>();
  for (const g of added) net.set(g, (net.get(g) ?? 0) + 1);
  for (const g of removed) net.set(g, (net.get(g) ?? 0) - 1);
  const active = [...net.entries()].filter(([, c]) => c > 0).map(([g]) => g);
  console.log("[reef-msg] discovery for", me, "→ addedType:", addedType, "| active groups:", active);
  return active;
}

// ── the adapter ───────────────────────────────────────────────────────────────

const TODO = (m: string): never => {
  throw new Error(`SuiMessaging.${m}() not implemented yet (on-chain port in progress)`);
};

export class SuiMessaging implements Messaging {
  #me: Me | null = null;
  #poll: ReturnType<typeof setInterval> | null = null;
  #lastOrder = new Map<string, number>();
  #pollFails = new Map<string, number>();

  setCurrentUser(me: Me): void {
    this.#me = me;
  }

  private me(): Me {
    return this.#me ?? requireRuntime().me;
  }

  // ── chats ──────────────────────────────────────────────────────────────────
  async listChats(): Promise<Chat[]> {
    const me = this.me();
    const rt = getMessagingRuntime();
    let discovered: string[] = [];
    try {
      discovered = await discoverGroupIds();
    } catch (e) {
      console.warn("[messaging] discovery failed:", e);
    }

    const storedByGroup = new Map(readStore(me.id).map((g) => [g.groupId, g]));
    // Every group I might belong to (discovered on-chain ∪ already stored), minus
    // ones we've already determined we can't join.
    const candidates = [...new Set([...discovered, ...storedByGroup.keys()])].filter(
      (id) => !readSkip(me.id).has(id),
    );

    if (rt && candidates.length) {
      // Metadata (uuid/name) for candidates we don't have stored yet.
      const needMeta = candidates.filter((id) => !storedByGroup.has(id));
      let meta: Record<string, { uuid: string; name?: string }> = {};
      if (needMeta.length) {
        try {
          meta = await rt.client.messaging.view.groupsMetadata({ groupIds: needMeta, refresh: true });
        } catch (e) {
          console.warn("[messaging] groupsMetadata failed:", e);
        }
      }
      for (const id of candidates) {
        // Ensure my delegate is a member (idempotent). If the group won't let us
        // join (orphaned / no PermissionsAdmin), skip it — never delete data.
        if (!readGrants(me.id).has(id)) {
          try {
            await ensureDelegateMembership(rt, id);
            console.log("[reef-msg] joined group", id);
          } catch (err) {
            console.warn("[reef-msg] can't join group", id, "→ skipping:", err instanceof Error ? err.message : err);
            markSkip(me.id, id);
            continue;
          }
        }
        if (!storedByGroup.has(id)) {
          const m = meta[id];
          if (m?.uuid) {
            upsertGroup(me.id, { uuid: m.uuid, groupId: id, name: m.name ?? "", type: "group", participantIds: [me.id], createdAt: Date.now() });
          }
        }
      }
    }

    const skip = readSkip(me.id);
    const visible = readStore(me.id).filter((g) => !skip.has(g.groupId));
    // Populate each chat's last message for the list preview (best-effort; a
    // just-joined group may 403 until the relayer syncs — the poll fills it in).
    const chats = await Promise.all(
      visible.map(async (g) => {
        // Resolve real names/avatars + detect DM-vs-group; persist for next time.
        if (rt) {
          try {
            const enriched = await enrichGroup(rt, g, me);
            if (enriched) {
              g = { ...g, resolved: enriched.participants, participantIds: enriched.participants.map((p) => p.id), type: enriched.type };
              upsertGroup(me.id, g);
            }
          } catch {
            /* keep existing store values */
          }
        }
        const chat = chatFromStored(g, me);
        if (rt) {
          try {
            const res = await rt.client.messaging.getMessages({ signer: rt.signer, groupRef: { uuid: g.uuid }, limit: 30 });
            const raw = res.messages as DecodedSdkMessage[];
            if (raw.length) {
              const latest = raw.reduce((a, b) => (a.order >= b.order ? a : b));
              const m = toMessage(g.uuid, latest);
              m.senderId = resolveSenderId(rt, g, m.senderId);
              m.sender = senderUserFor(g, me, m.senderId);
              chat.lastMessage = m;
              chat.lastMessageAt = m.createdAt;
            }
          } catch {
            /* not synced yet */
          }
        }
        return chat;
      }),
    );
    return dedupeDirects(chats, me.id).sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  }

  async getChat(chatId: string): Promise<Chat | null> {
    const me = this.me();
    const g = readStore(me.id).find((x) => x.uuid === chatId);
    return g ? chatFromStored(g, me) : null;
  }

  async createDirect(participantId: string): Promise<Chat> {
    const me = this.me();
    const rt = requireRuntime();
    const uuid = deriveDirectUuid(me.id, participantId);
    const groupId = rt.client.messaging.derive.groupId({ uuid });

    // 1. create + share the group if it doesn't exist yet (idempotent on retry).
    if (!(await groupExists(rt, groupId))) {
      try {
        await rt.sponsorExecute(rt.client.messaging.tx.createAndShareGroup({ uuid, name: "" }));
      } catch (e) {
        console.warn("[reef-msg] createAndShareGroup (may already exist):", e);
      }
    }
    // 2. grant the other party Reader+Sender+PermissionsAdmin (only what's missing)
    //    so THEY can later grant their own delegate (the two-way join).
    await grantMissing(rt, groupId, participantId, [MSG_PERMS.MessagingReader, MSG_PERMS.MessagingSender, GRP_PERMS.PermissionsAdmin, GRP_PERMS.ExtensionPermissionsAdmin]);
    // 3. add MY delegate so the relayer authorizes my sends/reads.
    await ensureDelegateMembership(rt, groupId);

    unmarkSkip(me.id, groupId); // an explicitly-started chat must never stay hidden
    const peer = await resolveProfile(participantId);
    upsertGroup(me.id, {
      uuid,
      groupId,
      name: "",
      type: "direct",
      participantIds: [me.id, participantId],
      resolved: [meUser(me), peer ?? participantFromAddress(participantId)],
      createdAt: Date.now(),
    });
    return (await this.getChat(uuid))!;
  }

  async createGroup(input: CreateGroupInput): Promise<Chat> {
    const me = this.me();
    const uuid = crypto.randomUUID();
    const rt = requireRuntime();
    const groupId = rt.client.messaging.derive.groupId({ uuid });

    if (!(await groupExists(rt, groupId))) {
      try {
        await rt.sponsorExecute(rt.client.messaging.tx.createAndShareGroup({ uuid, name: input.name }));
      } catch (e) {
        console.warn("[reef-msg] createAndShareGroup (may already exist):", e);
      }
    }
    for (const member of input.participantIds) {
      await grantMissing(rt, groupId, member, [MSG_PERMS.MessagingReader, MSG_PERMS.MessagingSender, GRP_PERMS.PermissionsAdmin, GRP_PERMS.ExtensionPermissionsAdmin]);
    }
    await ensureDelegateMembership(rt, groupId);

    unmarkSkip(me.id, groupId);
    const resolved = [meUser(me), ...(await Promise.all(input.participantIds.map(async (a) => (await resolveProfile(a)) ?? participantFromAddress(a))))];
    upsertGroup(me.id, { uuid, groupId, name: input.name, type: "group", participantIds: [me.id, ...input.participantIds], resolved, createdAt: Date.now() });
    return (await this.getChat(uuid))!;
  }

  async markRead(_chatId: string): Promise<void> {
    /* read receipts not modeled on-chain — no-op */
  }

  // ── messages ─────────────────────────────────────────────────────────────────
  async listMessages(chatId: string, cursor?: string | null): Promise<{ messages: Message[]; nextCursor: string | null }> {
    const rt = requireRuntime();
    // Make sure my delegate is a member before reading (repairs orphaned/joined groups).
    const g = readStore(this.me().id).find((x) => x.uuid === chatId);
    if (g) {
      try {
        await ensureDelegateMembership(rt, g.groupId);
      } catch (e) {
        console.warn("[messaging] ensureDelegateMembership failed:", e);
      }
    }
    const beforeOrder = cursor ? Number(cursor) : undefined;
    // The relayer syncs membership from chain with a lag; retry through the
    // brief "not a member" window right after a grant.
    let res: Awaited<ReturnType<typeof rt.client.messaging.getMessages>> | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        res = await rt.client.messaging.getMessages({ signer: rt.signer, groupRef: { uuid: chatId }, limit: 50, beforeOrder });
        break;
      } catch (e) {
        const notMember = e instanceof Error && /not a member/i.test(e.message);
        if (!notMember || attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!res) return { messages: [], nextCursor: null };
    const raw = res.messages as DecodedSdkMessage[];
    const msgs = raw
      .map((dm) => {
        const m = toMessage(chatId, dm);
        if (g) {
          m.senderId = resolveSenderId(rt, g, m.senderId);
          m.sender = senderUserFor(g, this.me(), m.senderId);
        }
        return m;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (raw.length) {
      const maxOrder = Math.max(...raw.map((m) => m.order));
      this.#lastOrder.set(chatId, Math.max(this.#lastOrder.get(chatId) ?? -1, maxOrder));
    }
    const minOrder = raw.length ? Math.min(...raw.map((m) => m.order)) : 0;
    return { messages: msgs, nextCursor: res.hasNext ? String(minOrder) : null };
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const rt = requireRuntime();
    const text = encodeEnvelope(input);
    // The relayer syncs on-chain membership with a lag; retry through the brief
    // "not a member" window right after joining a group.
    let messageId = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        ({ messageId } = await rt.client.messaging.sendMessage({ signer: rt.signer, groupRef: { uuid: input.chatId }, text }));
        break;
      } catch (e) {
        const notMember = e instanceof Error && /not a member/i.test(e.message);
        if (!notMember || attempt === 4) throw e;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    return {
      id: messageId,
      chatId: input.chatId,
      senderId: this.me().id,
      type: input.type ?? "text",
      content: input.content,
      replyToId: input.replyToId,
      mentionIds: input.mentionIds,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      isForwarded: input.isForwarded,
      isWhisper: input.isWhisper,
      viewOnce: input.viewOnce,
      status: "sent",
      clientId: input.clientId,
      createdAt: new Date().toISOString(),
    };
  }

  async editMessage(messageId: string, content: string): Promise<void> {
    // messageId alone isn't enough (SDK needs groupRef); handled via re-send in v1.
    void messageId;
    void content;
    TODO("editMessage");
  }

  async deleteMessage(messageId: string): Promise<void> {
    void messageId;
    TODO("deleteMessage");
  }

  async searchMessages(chatId: string, query: string): Promise<Message[]> {
    const { messages } = await this.listMessages(chatId);
    const q = query.toLowerCase();
    return messages.filter((m) => m.content.toLowerCase().includes(q));
  }

  // ── real-time (polling for v1) ───────────────────────────────────────────────
  subscribe(handler: MessagingEventHandler): () => void {
    const tick = async () => {
      const rt = getMessagingRuntime();
      if (!rt) return;
      const me = this.me();
      const granted = readGrants(me.id);
      for (const g of readStore(me.id)) {
        // Skip groups our delegate isn't a member of yet — avoids relayer 403 spam.
        if (!granted.has(g.groupId)) continue;
        try {
          const after = this.#lastOrder.get(g.uuid) ?? -1;
          const res = await rt.client.messaging.getMessages({ signer: rt.signer, groupRef: { uuid: g.uuid }, afterOrder: after < 0 ? undefined : after, limit: 50 });
          this.#pollFails.delete(g.uuid);
          if (res.messages.length) console.log("[reef-msg] poll got", res.messages.length, "msg(s) for", g.uuid);
          for (const raw of res.messages as DecodedSdkMessage[]) {
            if (raw.order <= (this.#lastOrder.get(g.uuid) ?? -1)) continue;
            this.#lastOrder.set(g.uuid, raw.order);
            const msg = toMessage(g.uuid, raw);
            msg.senderId = resolveSenderId(rt, g, msg.senderId);
            msg.sender = senderUserFor(g, me, msg.senderId);
            const isOwn = msg.senderId.toLowerCase() === me.id.toLowerCase();
            const mentionsMe = (msg.mentionIds ?? []).some((id) => id.toLowerCase() === me.id.toLowerCase());
            const ev: MessagingEvent = { type: "message", message: msg, isOwn, mentionsMe };
            handler(ev);
          }
        } catch (err) {
          // The relayer answers a non-member read with 403 Forbidden; the SDK
          // surfaces that (and the plain "not a member" case) here. Treat both as
          // "membership not synced" so orphaned groups actually reach the skip
          // threshold instead of 403-spamming forever.
          const notMember = err instanceof Error && /(not a member|forbidden|403)/i.test(err.message);
          if (notMember) {
            // Relayer hasn't synced our membership. A few seconds of lag is normal;
            // but if it never syncs (an orphaned group whose grant the relayer
            // permanently missed), hide it after ~1min so it stops 403-spamming.
            const n = (this.#pollFails.get(g.uuid) ?? 0) + 1;
            this.#pollFails.set(g.uuid, n);
            if (n === 1) console.warn("[reef-msg] awaiting relayer membership sync for", g.uuid);
            if (n >= 15) {
              console.warn("[reef-msg] giving up on", g.uuid, "(relayer never synced membership) — hiding");
              markSkip(me.id, g.groupId);
              this.#pollFails.delete(g.uuid);
            }
          } else {
            console.warn("[reef-msg] poll getMessages failed for", g.uuid, "→", err instanceof Error ? err.message : err);
          }
        }
      }
    };
    this.#poll = setInterval(() => void tick(), 3500);
    void tick();
    return () => {
      if (this.#poll) clearInterval(this.#poll);
      this.#poll = null;
    };
  }

  // ── people ─────────────────────────────────────────────────────────────────
  async searchUsers(query: string): Promise<Participant[]> {
    const q = query.trim();
    if (!q) return [];
    const me = this.me();
    const out: Participant[] = [];
    // Allow starting a DM by pasting a raw address.
    if (q.startsWith("0x") && q.length >= 42) out.push(participantFromAddress(q));
    // Fuzzy search ReeF profiles by handle or display name (indexer).
    try {
      const rows = await trpc.searchProfiles.query({ q: q.replace(/^@/, ""), limit: 12 });
      for (const p of rows) {
        if (p.owner.toLowerCase() === me.id.toLowerCase()) continue; // not yourself
        if (out.some((u) => u.id.toLowerCase() === p.owner.toLowerCase())) continue;
        out.push({
          id: p.owner,
          username: p.handle,
          displayName: p.displayName ?? undefined,
          avatarUrl: p.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : undefined,
        });
      }
    } catch (e) {
      console.warn("[messaging] searchProfiles failed:", e);
    }
    return out;
  }

  // ── media (Walrus handled inside the SDK when attachments configured) ─────────
  async uploadMedia(_file: File): Promise<UploadResult> {
    return TODO("uploadMedia");
  }

  // ── SECONDARY: safe no-ops so the UI doesn't crash (not yet persisted) ────────
  async addReaction(_messageId: string, _emoji: string): Promise<void> {}
  async removeReaction(_messageId: string, _emoji: string): Promise<void> {}
  async setDisappearing(_chatId: string, _seconds: number): Promise<void> {}
  async pinMessage(_messageId: string, _pinned: boolean): Promise<void> {}
  async listPinned(_chatId: string): Promise<Message[]> { return []; }
  async saveMessage(_messageId: string): Promise<void> {}
  async unsaveMessage(_messageId: string): Promise<void> {}
  async listSaved(): Promise<Message[]> { return []; }
  async votePoll(_messageId: string, _optionIndex: number): Promise<void> {}
  async markViewOnce(_messageId: string): Promise<void> {}
  setTyping(_chatId: string, _isTyping: boolean): void {}
  async setChatSettings(_chatId: string, _settings: { muted?: boolean; archived?: boolean }): Promise<void> {}
  async blockUser(_userId: string): Promise<void> {}
  async unblockUser(_userId: string): Promise<void> {}
  async listBlocked(): Promise<Participant[]> { return []; }
  async reportUser(_userId: string, _reason: string, _chatId?: string): Promise<void> {}
  async listStatus(): Promise<StatusGroup[]> { return []; }
  async viewStatus(_statusId: string): Promise<void> {}
  async deleteStatus(_statusId: string): Promise<void> {}
  async vaultStatus(): Promise<{ hasPasscode: boolean; unlocked: boolean }> { return { hasPasscode: false, unlocked: true }; }
  async listVaultChats(): Promise<Chat[]> { return []; }
  lockVault(): void {}

  // ── UNSUPPORTED yet: throw (feature needs a design pass) ──────────────────────
  async createPoll(_c: string, _q: string, _o: string[], _m: boolean): Promise<Message> { return TODO("createPoll"); }
  async vaultSetup(_p: string, _c?: string): Promise<void> { TODO("vaultSetup"); }
  async vaultUnlock(_p: string): Promise<boolean> { return TODO("vaultUnlock"); }
  async setChatVaulted(_c: string, _v: boolean): Promise<void> { TODO("setChatVaulted"); }
  async postStatus(_i: StatusInput): Promise<void> { TODO("postStatus"); }
  async chosenStart(_c: string, _cfg: ChosenConfig): Promise<void> { TODO("chosenStart"); }
  async chosenJoin(_c: string): Promise<void> { TODO("chosenJoin"); }
  async chosenLeave(_c: string): Promise<void> { TODO("chosenLeave"); }
  async chosenTap(_c: string): Promise<void> { TODO("chosenTap"); }
  async chosenPick(_c: string, _n: number): Promise<void> { TODO("chosenPick"); }
  async chosenNext(_c: string): Promise<void> { TODO("chosenNext"); }
  async chosenEnd(_c: string): Promise<void> { TODO("chosenEnd"); }
  async chosenSync(_c: string): Promise<void> { TODO("chosenSync"); }

  // ── group management ─────────────────────────────────────────────────────────
  async updateGroup(chatId: string, patch: GroupPatch): Promise<Chat> {
    const me = this.me();
    const g = readStore(me.id).find((x) => x.uuid === chatId);
    if (!g) throw new Error("chat not found");
    if (patch.name !== undefined) {
      const rt = requireRuntime();
      const tx = rt.client.messaging.tx.setGroupName({ groupId: g.groupId, name: patch.name });
      await rt.sponsorExecute(tx);
      upsertGroup(me.id, { ...g, name: patch.name });
    }
    return (await this.getChat(chatId))!;
  }

  async addParticipants(chatId: string, userIds: string[]): Promise<Chat> {
    const me = this.me();
    const g = readStore(me.id).find((x) => x.uuid === chatId);
    if (!g) throw new Error("chat not found");
    const rt = requireRuntime();
    const perms = messagingPermissionTypes(TESTNET_SUI_STACK_MESSAGING_PACKAGE_CONFIG.originalPackageId);
    for (const member of userIds) {
      const tx = rt.client.groups.tx.grantPermissions({ groupId: g.groupId, member, permissionTypes: [perms.MessagingReader, perms.MessagingSender] });
      await rt.sponsorExecute(tx);
    }
    upsertGroup(me.id, { ...g, participantIds: [...new Set([...g.participantIds, ...userIds])] });
    return (await this.getChat(chatId))!;
  }

  async removeParticipant(chatId: string, userId: string): Promise<Chat> {
    void userId;
    return (await this.getChat(chatId)) ?? TODO("removeParticipant");
  }

  async setAdmin(chatId: string, _userId: string, _admin: boolean): Promise<Chat> {
    return (await this.getChat(chatId)) ?? TODO("setAdmin");
  }

  async leaveGroup(chatId: string): Promise<void> {
    const me = this.me();
    const g = readStore(me.id).find((x) => x.uuid === chatId);
    if (!g) return;
    const rt = requireRuntime();
    const tx = rt.client.messaging.tx.leave({ groupId: g.groupId });
    await rt.sponsorExecute(tx);
    writeStore(me.id, readStore(me.id).filter((x) => x.uuid !== chatId));
  }
}
