"use client";

import { useMemo, useState } from "react";
import { Avatar, Spinner } from "@/components/ui";
import { useMessaging } from "../lib/provider";
import { chatAvatar, chatName, previewOf } from "../lib/display";
import { timeAgo } from "../lib/format";
import type { Chat } from "../lib/types";
import { StoriesBar } from "./stories";
import { PlusIcon, SearchIcon, UsersIcon } from "./icons";

export function ChatList({ onNew, onNewGroup, onVault }: { onNew: () => void; onNewGroup: () => void; onVault: () => void }) {
  const { state, me, activeChat, openChat } = useMessaging();
  const [q, setQ] = useState("");

  const chats = useMemo(() => {
    const list = state.chats.filter((c) => !c.archived);
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => chatName(c, me?.id).toLowerCase().includes(needle));
  }, [state.chats, q, me?.id]);

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
          🔒
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
        {chat.muted ? <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-surface text-[9px]">🔕</span> : null}
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
