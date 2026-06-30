"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui";
import { useMessaging } from "../lib/provider";
import { chatAvatar, chatName, peerOf } from "../lib/display";
import { dayLabel } from "../lib/format";
import type { Chat, Message } from "../lib/types";
import { MessageBubble, type ReplyPreview } from "./message-bubble";
import { MessageActions } from "./message-actions";
import { ForwardModal } from "./forward-modal";
import { ChatInfoModal } from "./chat-info-modal";
import { ImageViewer } from "./image-viewer";
import { SearchPanel } from "./search-panel";
import { SavedModal } from "./saved-modal";
import { ChosenGame } from "./chosen-game";
import { Composer } from "./composer";
import { BackIcon, MoreIcon, SearchIcon } from "./icons";

const DISAPPEAR_OPTIONS: { label: string; seconds: number }[] = [
  { label: "Off", seconds: 0 },
  { label: "1 hour", seconds: 3600 },
  { label: "24 hours", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
];

export function ChatThread({ onBack }: { onBack: () => void }) {
  const { state, me, activeChat, toggleReaction, votePoll, markViewOnce } = useMessaging();
  const scrollRef = useRef<HTMLDivElement>(null);
  const chat = activeChat;
  const messages = useMemo(() => (chat ? state.messages[chat.id] ?? [] : []), [chat, state.messages]);
  const typing = chat ? state.typingUsers[chat.id] ?? [] : [];
  const lastLen = useRef(0);

  // per-message overlays
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [chosenOpen, setChosenOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // live tick while a disappearing message is counting down, then it vanishes
  const hasExpiring = useMemo(() => messages.some((m) => m.expiresAt), [messages]);
  useEffect(() => {
    if (!hasExpiring) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasExpiring]);

  const visible = useMemo(
    () => messages.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > nowMs),
    [messages, nowMs],
  );
  const byId = useMemo(() => new Map(visible.map((m) => [m.id, m])), [visible]);
  const pinned = useMemo(() => visible.filter((m) => m.isPinned && !m.isDeleted), [visible]);

  // reset transient UI when switching chats
  useEffect(() => {
    setActionMsg(null);
    setReplyTo(null);
    setEditing(null);
    setForwardMsg(null);
    setInfoOpen(false);
    setSearchOpen(false);
    setChosenOpen(false);
  }, [chat?.id]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastLen.current = messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    if (messages.length > lastLen.current && nearBottom) el.scrollTop = el.scrollHeight;
    lastLen.current = messages.length;
  }, [messages.length]);

  const jumpTo = (messageId: string) => {
    setSearchOpen(false);
    requestAnimationFrame(() => {
      const node = document.getElementById(`m-${messageId}`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.classList.add("ring-2", "ring-accent", "rounded-[18px]");
      setTimeout(() => node.classList.remove("ring-2", "ring-accent", "rounded-[18px]"), 1600);
    });
  };

  if (!chat) {
    return (
      <div className="hidden h-full flex-1 flex-col items-center justify-center gap-3 text-center md:flex">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-muted text-2xl">🐚</span>
        <p className="text-[15px] font-semibold">Your messages</p>
        <p className="max-w-xs text-sm text-ink-soft">Pick a conversation, or start a new one. Going on-chain soon.</p>
      </div>
    );
  }

  const av = chatAvatar(chat, me?.id);
  const peer = peerOf(chat, me?.id);
  const online = peer ? state.onlineUserIds.includes(peer.id) : false;
  const statusLine = typing.length
    ? chat.type === "group" ? `${typing.join(", ")} typing…` : "typing…"
    : chat.type === "group" ? `${chat.participants.length} members` : online ? "online" : "offline";

  const replyName = replyTo ? (replyTo.senderId === me?.id ? "yourself" : replyTo.sender?.displayName || replyTo.sender?.username || "") : undefined;

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-[color:var(--glass-border)] bg-[color:color-mix(in_srgb,var(--surface)_82%,transparent)] px-3 py-2.5 backdrop-blur-xl">
        <button onClick={onBack} aria-label="Back" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-muted md:hidden">
          <BackIcon className="h-5 w-5" />
        </button>
        <button onClick={() => setInfoOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar name={av.name} src={av.src} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-[15.5px] font-bold leading-tight">{chatName(chat, me?.id)}</span>
            <span className={`block truncate text-[12px] ${typing.length ? "text-accent" : "text-ink-faint"}`}>{statusLine}</span>
          </span>
        </button>
        <button onClick={() => setSearchOpen(true)} aria-label="Search" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
          <SearchIcon className="h-[19px] w-[19px]" />
        </button>
        <HeaderMenu chat={chat} onInfo={() => setInfoOpen(true)} onSearch={() => setSearchOpen(true)} onSaved={() => setSavedOpen(true)} onChosen={() => setChosenOpen(true)} />
      </div>

      {/* pinned bar */}
      {pinned.length ? (
        (() => {
          const last = pinned[pinned.length - 1]!;
          return (
            <button onClick={() => jumpTo(last.id)} className="flex items-center gap-2 border-b border-[color:var(--glass-border)] bg-accent/5 px-4 py-2 text-left">
              <span className="text-[13px]">📌</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-accent-ink">Pinned · {pinned.length}</span>
                <span className="block truncate text-[12.5px] text-ink-soft">{last.content || "media"}</span>
              </span>
            </button>
          );
        })()
      ) : null}

      {/* messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visible.length === 0 ? (
          <div className="grid h-full place-items-center"><p className="text-sm text-ink-faint">Say hi 👋</p></div>
        ) : (
          renderRuns(visible, me?.id, chat.type === "group", byId, {
            onOpenActions: setActionMsg,
            onOpenImage: setViewerUrl,
            onToggleReaction: (m, e) => void toggleReaction(m, e),
            onJumpToReply: jumpTo,
            onVotePoll: (id, i) => void votePoll(id, i),
            onViewOnce: (m) => { if (m.fileUrl) setViewerUrl(m.fileUrl); void markViewOnce(m); },
          })
        )}
        {typing.length ? <TypingDots /> : null}
      </div>

      <Composer
        chatId={chat.id}
        participants={chat.type === "group" ? chat.participants : []}
        allowAsides={chat.type === "group" && !!chat.allowAsides}
        meId={me?.id}
        replyTo={replyTo}
        replyName={replyName}
        editing={editing}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditing(null)}
      />

      {/* overlays */}
      {searchOpen ? <SearchPanel chatId={chat.id} onClose={() => setSearchOpen(false)} onJump={jumpTo} /> : null}
      {actionMsg ? (
        <MessageActions
          message={actionMsg}
          mine={actionMsg.senderId === me?.id}
          onReply={(m) => { setReplyTo(m); setEditing(null); }}
          onForward={(m) => setForwardMsg(m)}
          onEdit={(m) => { setEditing(m); setReplyTo(null); }}
          onClose={() => setActionMsg(null)}
        />
      ) : null}
      {forwardMsg ? <ForwardModal message={forwardMsg} onClose={() => setForwardMsg(null)} /> : null}
      {infoOpen ? <ChatInfoModal chat={chat} onClose={() => setInfoOpen(false)} /> : null}
      {savedOpen ? <SavedModal onClose={() => setSavedOpen(false)} /> : null}
      {chosenOpen ? <ChosenGame chat={chat} onClose={() => setChosenOpen(false)} /> : null}
      {viewerUrl ? <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} /> : null}
    </div>
  );
}

function HeaderMenu({ chat, onInfo, onSearch, onSaved, onChosen }: { chat: Chat; onInfo: () => void; onSearch: () => void; onSaved: () => void; onChosen: () => void }) {
  const { setChatSettings, setDisappearing } = useMessaging();
  const [open, setOpen] = useState(false);
  const [disOpen, setDisOpen] = useState(false);
  const item = "block w-full rounded-xl px-3 py-2 text-left text-[14px] hover:bg-surface-muted";
  const curDis = chat.disappearingSeconds ?? 0;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="More" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
        <MoreIcon className="h-[19px] w-[19px]" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => { setOpen(false); setDisOpen(false); }} />
          <div className="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-2xl border border-[color:var(--glass-border)] bg-surface p-1.5 shadow-[var(--shadow-glass-lg)]">
            <button className={item} onClick={() => { onSearch(); setOpen(false); }}>Search</button>
            <button className={item} onClick={() => { onInfo(); setOpen(false); }}>{chat.type === "group" ? "Group info" : "Contact info"}</button>
            <button className={item} onClick={() => { onSaved(); setOpen(false); }}>Saved messages</button>
            {chat.type === "group" && chat.allowChosen ? (
              <button className={item} onClick={() => { onChosen(); setOpen(false); }}>🎯 Play Chosen</button>
            ) : null}
            <button className={`${item} flex items-center justify-between`} onClick={() => setDisOpen((d) => !d)}>
              <span>Disappearing</span>
              <span className="font-mono text-[11px] text-ink-faint">{DISAPPEAR_OPTIONS.find((o) => o.seconds === curDis)?.label ?? "Off"}</span>
            </button>
            {disOpen ? (
              <div className="ml-2 border-l border-[color:var(--glass-border)] pl-1">
                {DISAPPEAR_OPTIONS.map((o) => (
                  <button key={o.seconds} className={`${item} ${o.seconds === curDis ? "text-accent-ink font-semibold" : ""}`} onClick={() => { void setDisappearing(chat.id, o.seconds); setOpen(false); setDisOpen(false); }}>
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
            <button className={item} onClick={() => { void setChatSettings(chat.id, { muted: !chat.muted }); setOpen(false); }}>{chat.muted ? "Unmute" : "Mute"}</button>
            <button className={item} onClick={() => { void setChatSettings(chat.id, { archived: !chat.archived }); setOpen(false); }}>{chat.archived ? "Unarchive" : "Archive"}</button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function renderRuns(
  messages: Message[],
  meId: string | undefined,
  isGroup: boolean,
  byId: Map<string, Message>,
  handlers: {
    onOpenActions: (m: Message) => void;
    onOpenImage: (url: string) => void;
    onToggleReaction: (m: Message, emoji: string) => void;
    onJumpToReply: (id: string) => void;
    onVotePoll: (messageId: string, idx: number) => void;
    onViewOnce: (m: Message) => void;
  },
) {
  const out: ReactNode[] = [];
  let lastDay = "";
  messages.forEach((m, i) => {
    const day = m.createdAt.slice(0, 10);
    if (day !== lastDay) {
      out.push(
        <div key={`day-${day}-${i}`} className="my-3 flex justify-center">
          <span className="rounded-full bg-surface-muted px-3 py-1 font-mono text-[10.5px] uppercase tracking-wide text-ink-faint">{dayLabel(m.createdAt)}</span>
        </div>,
      );
      lastDay = day;
    }
    const mine = m.senderId === meId;
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sameAsPrev = prev && prev.senderId === m.senderId && prev.createdAt.slice(0, 10) === day;
    const sameAsNext = next && next.senderId === m.senderId && next.createdAt.slice(0, 10) === day;
    const replyPreview = resolveReply(m, byId, meId);
    out.push(
      <div id={`m-${m.id}`} key={m.id}>
        <MessageBubble
          message={m}
          mine={mine}
          meId={meId}
          showSender={isGroup && !mine && !sameAsPrev}
          showAvatar={!mine && !sameAsNext}
          replyPreview={replyPreview}
          {...handlers}
        />
      </div>,
    );
  });
  return out;
}

function resolveReply(m: Message, byId: Map<string, Message>, meId: string | undefined): ReplyPreview | undefined {
  if (!m.replyToId) return undefined;
  const t = byId.get(m.replyToId);
  if (!t) return { name: "", text: "Original message" };
  const name = t.senderId === meId ? "You" : t.sender?.displayName || t.sender?.username || "";
  const text = t.isDeleted ? "Message deleted" : t.content || (t.type === "image" ? "📷 Photo" : t.type === "file" ? "📎 File" : "media");
  return { name, text };
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}
