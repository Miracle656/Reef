"use client";

import { useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Spinner } from "@/components/ui";
import { trpc } from "@/lib/trpc";
import { useMessaging } from "../lib/provider";
import { chatAvatar, chatName, previewOf } from "../lib/display";
import { timeAgo } from "../lib/format";
import { isRequestChat, markAccepted, readAccepted, requestPeerOf } from "../lib/requests";
import type { Chat } from "../lib/types";
import { StoriesBar } from "./stories";
import { BackIcon, BellOffIcon, LockIcon, PlusIcon, SearchIcon, UsersIcon } from "./icons";

export function ChatList({ onNew, onNewGroup, onVault }: { onNew: () => void; onNewGroup: () => void; onVault: () => void }) {
  const { state, me, activeChat, openChat } = useMessaging();
  const [q, setQ] = useState("");
  const [showRequests, setShowRequests] = useState(false);
  const [, bump] = useReducer((x: number) => x + 1, 0); // re-render after Accept

  // Who I follow (indexer graph) — DMs from anyone else are "requests".
  const followingQ = useQuery({
    queryKey: ["following", me?.id],
    queryFn: async () => (await trpc.following.query({ address: me!.id })).map((r) => r.followee.toLowerCase()),
    enabled: Boolean(me?.id?.startsWith("0x")),
    staleTime: 60_000,
  });
  const following = useMemo(() => new Set(followingQ.data ?? []), [followingQ.data]);
  // Read fresh each render — replying elsewhere (provider) also accepts a chat.
  const accepted = me ? readAccepted(me.id) : new Set<string>();

  const all = useMemo(() => state.chats.filter((c) => !c.archived), [state.chats]);
  const requests = useMemo(
    () => (me ? all.filter((c) => isRequestChat(c, me.id, following, accepted)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, me, following, accepted.size],
  );
  const requestIds = useMemo(() => new Set(requests.map((c) => c.id)), [requests]);

  const chats = useMemo(() => {
    const list = all.filter((c) => !requestIds.has(c.id));
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => chatName(c, me?.id).toLowerCase().includes(needle));
  }, [all, requestIds, q, me?.id]);

  const requestUnread = requests.reduce((n, c) => n + (c.unreadCount ?? 0), 0);

  if (showRequests) {
    return (
      <RequestsPane
        requests={requests}
        meId={me?.id}
        activeId={activeChat?.id}
        onBack={() => setShowRequests(false)}
        onOpen={openChat}
        onAccept={(c) => {
          const peer = me ? requestPeerOf(c, me.id) : undefined;
          if (me && peer) markAccepted(me.id, peer);
          bump();
        }}
      />
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <h1 className="flex-1 text-[22px] font-black tracking-tight">Messages</h1>
        <button
          type="button"
          onClick={onVault}
          aria-label="Vault"
          title="The Vault — passcode-locked chats"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface-muted"
        >
          <LockIcon className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          onClick={onNewGroup}
          aria-label="New group"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface-muted"
        >
          <UsersIcon />
        </button>
        <button
          type="button"
          onClick={onNew}
          aria-label="New message"
          className="lift grid h-9 w-9 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-glass)]"
        >
          <PlusIcon />
        </button>
      </div>

      {/* search */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-full border border-[color:var(--glass-border)] bg-surface-glass px-3.5 py-2 backdrop-blur-xl">
          <SearchIcon className="h-[17px] w-[17px] text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>

      <StoriesBar />

      {/* message requests entry — DMs from people you don't follow wait here */}
      {requests.length ? (
        <button
          type="button"
          onClick={() => setShowRequests(true)}
          className="mx-4 mb-1 flex items-center gap-2.5 rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-3.5 py-2.5 text-left transition-colors hover:bg-surface-muted"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-ink">
            <UsersIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold">Message requests</span>
            <span className="block truncate text-[12px] text-ink-faint">
              {requests.length} from people you don’t follow
            </span>
          </span>
          {requestUnread > 0 ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" /> : null}
        </button>
      ) : null}

      {/* list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {state.loadingChats ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : chats.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-ink-soft">{q ? "No matches." : "No conversations yet."}</p>
            {!q ? (
              <button onClick={onNew} className="mt-3 text-sm font-semibold text-accent hover:underline">
                Start a conversation
              </button>
            ) : null}
          </div>
        ) : (
          chats.map((c) => (
            <ChatRow key={c.id} chat={c} meId={me?.id} active={activeChat?.id === c.id} onClick={() => openChat(c.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function RequestsPane({
  requests,
  meId,
  activeId,
  onBack,
  onOpen,
  onAccept,
}: {
  requests: Chat[];
  meId?: string;
  activeId?: string;
  onBack: () => void;
  onOpen: (chatId: string) => void;
  onAccept: (chat: Chat) => void;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-surface-muted"
        >
          <BackIcon className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-[22px] font-black tracking-tight">Requests</h1>
      </div>
      <p className="px-5 pb-3 text-[12.5px] leading-relaxed text-ink-soft">
        Chats from people you don’t follow. They can’t tell you’ve seen a request — replying or
        accepting moves it to your inbox.
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {requests.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-ink-soft">No requests.</p>
        ) : (
          requests.map((c) => (
            <div key={c.id} className="flex items-center gap-1 pr-2">
              <div className="min-w-0 flex-1">
                <ChatRow chat={c} meId={meId} active={activeId === c.id} onClick={() => onOpen(c.id)} />
              </div>
              <button
                type="button"
                onClick={() => onAccept(c)}
                className="lift shrink-0 rounded-full bg-accent px-3 py-1.5 text-[12px] font-bold text-on-accent"
              >
                Accept
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ChatRow({ chat, meId, active, onClick }: { chat: Chat; meId?: string; active: boolean; onClick: () => void }) {
  const av = chatAvatar(chat, meId);
  const unread = chat.unreadCount ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors ${
        active ? "bg-ink/[0.06]" : "hover:bg-surface-muted"
      }`}
    >
      <span className="relative shrink-0">
        <Avatar name={av.name} src={av.src} size={48} />
        {chat.muted ? <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-surface text-ink-soft"><BellOffIcon className="h-2.5 w-2.5" /></span> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[15px] ${unread ? "font-bold text-ink" : "font-semibold text-ink"}`}>
            {chatName(chat, meId)}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-faint">{timeAgo(chat.lastMessageAt)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[13px] ${unread ? "text-ink-soft" : "text-ink-faint"}`}>
            {previewOf(chat, meId)}
          </span>
          {chat.mentioned ? <span className="shrink-0 text-[12px] font-bold text-accent">@</span> : null}
          {unread > 0 ? (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
