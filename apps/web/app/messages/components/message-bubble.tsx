"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";
import { AnimatedEmoji, renderEmoji, isOnlyEmoji } from "@/lib/emoji";
import { timeShort } from "../lib/format";
import type { Message } from "../lib/types";
import { PollView } from "./poll-view";
import { CheckIcon, CheckCheckIcon, EyeIcon, ImageIcon, LockIcon, MapPinIcon, MicIcon, MoreIcon, PaperclipIcon, ReplyIcon } from "./icons";

export interface ReplyPreview {
  name: string;
  text: string;
}

export function MessageBubble({
  message,
  mine,
  meId,
  showSender,
  showAvatar,
  replyPreview,
  onOpenActions,
  onOpenImage,
  onToggleReaction,
  onJumpToReply,
  onVotePoll,
  onViewOnce,
}: {
  message: Message;
  mine: boolean;
  meId?: string;
  showSender: boolean;
  showAvatar: boolean;
  replyPreview?: ReplyPreview;
  onOpenActions: (m: Message) => void;
  onOpenImage: (url: string) => void;
  onToggleReaction: (m: Message, emoji: string) => void;
  onJumpToReply?: (messageId: string) => void;
  onVotePoll: (messageId: string, idx: number) => void;
  onViewOnce: (m: Message) => void;
}) {
  const m = message;
  const reactions = groupReactions(m, meId);
  const redacted = m.redacted; // aside the viewer can't read

  return (
    <div className={`group flex w-full items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine ? (
        <span className="w-7 shrink-0">{showAvatar ? <Avatar name={m.sender?.username ?? "?"} src={m.sender?.avatarUrl} size={28} /> : null}</span>
      ) : null}

      {mine ? <ActionDot onClick={() => onOpenActions(m)} /> : null}

      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {showSender && !mine ? (
          <span className="mb-0.5 px-1 text-[12px] font-semibold text-accent-ink">{m.sender?.displayName || m.sender?.username}</span>
        ) : null}

        <div
          className={`relative rounded-[18px] px-3.5 py-2 text-[14.5px] leading-snug shadow-[var(--shadow-glass)] ${
            mine ? "rounded-br-[6px] bg-accent text-on-accent" : "rounded-bl-[6px] border border-[color:var(--glass-border)] bg-surface text-ink"
          } ${m.failed ? "opacity-70 ring-1 ring-danger" : ""}`}
        >
          {m.audienceIds?.length && !redacted && !m.isDeleted ? (
            <span className={`mb-0.5 flex items-center gap-1 text-[11px] italic ${mine ? "text-on-accent/70" : "text-ink-faint"}`}><LockIcon className="h-3 w-3" /> Aside · {m.audienceIds.length} can see</span>
          ) : null}

          {m.isForwarded && !m.isDeleted ? (
            <span className={`mb-0.5 flex items-center gap-1 text-[11px] italic ${mine ? "text-on-accent/70" : "text-ink-faint"}`}>
              <ReplyIcon className="h-3 w-3 scale-x-[-1]" /> Forwarded
            </span>
          ) : null}

          {replyPreview && !m.isDeleted ? (
            <button
              onClick={() => m.replyToId && onJumpToReply?.(m.replyToId)}
              className={`mb-1 block w-full rounded-[10px] border-l-2 px-2 py-1 text-left text-[12.5px] ${mine ? "border-on-accent/50 bg-white/10" : "border-accent bg-accent/8"}`}
            >
              <span className={`block font-semibold ${mine ? "text-on-accent" : "text-accent-ink"}`}>{replyPreview.name}</span>
              <span className={`block truncate ${mine ? "text-on-accent/80" : "text-ink-soft"}`}>{replyPreview.text}</span>
            </button>
          ) : null}

          {m.isDeleted ? (
            <span className="italic opacity-70">Message deleted</span>
          ) : redacted ? (
            <span className="flex items-center gap-1 italic opacity-70"><LockIcon className="h-3.5 w-3.5" /> This message is an aside you can’t read</span>
          ) : (
            <Content message={m} mine={mine} onOpenImage={onOpenImage} onVotePoll={onVotePoll} onViewOnce={onViewOnce} />
          )}

          <span className={`mt-0.5 flex items-center justify-end gap-1 ${mine ? "text-on-accent/70" : "text-ink-faint"}`}>
            {m.expiresAt && !m.isDeleted ? <span className="text-[10px]" title="Disappearing message">⏲ {fmtExpiry(m.expiresAt)}</span> : null}
            {m.isEdited && !m.isDeleted ? <span className="text-[10px]">edited</span> : null}
            <span className="font-mono text-[10px]">{timeShort(m.createdAt)}</span>
            {mine && !m.isDeleted ? <Ticks message={m} /> : null}
          </span>
        </div>

        {reactions.length ? (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onToggleReaction(m, r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[12px] ${r.mine ? "border-accent bg-accent/15 text-accent-ink" : "border-[color:var(--glass-border)] bg-surface"}`}
              >
                <AnimatedEmoji char={r.emoji} size={15} />
                <span className="font-mono text-[10.5px]">{r.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {m.failed ? <span className="mt-0.5 px-1 text-[11px] text-danger">Not delivered</span> : null}
      </div>

      {!mine ? <ActionDot onClick={() => onOpenActions(m)} /> : null}
    </div>
  );
}

function ActionDot({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Message actions"
      className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint opacity-100 transition-opacity hover:bg-surface-muted hover:text-ink md:opacity-0 md:group-hover:opacity-100"
    >
      <MoreIcon className="h-4 w-4" />
    </button>
  );
}

function Content({
  message: m,
  mine,
  onOpenImage,
  onVotePoll,
  onViewOnce,
}: {
  message: Message;
  mine: boolean;
  onOpenImage: (url: string) => void;
  onVotePoll: (messageId: string, idx: number) => void;
  onViewOnce: (m: Message) => void;
}) {
  if (m.isWhisper) return <Whisper message={m} mine={mine} />;
  if (m.viewOnce && (m.type === "image" || m.fileUrl)) {
    return m.viewOnceViewed ? (
      <span className="flex items-center gap-1.5 italic opacity-70"><EyeIcon className="h-4 w-4" /> Opened</span>
    ) : (
      <button onClick={() => onViewOnce(m)} className="flex items-center gap-2 font-medium underline">
        <EyeIcon className="h-4 w-4" /> View once · tap to open
      </button>
    );
  }
  if (m.type === "voice" && m.fileUrl) {
    return (
      <span className="flex items-center gap-2">
        <MicIcon className="h-4 w-4" />
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={m.fileUrl} className="h-9 max-w-[220px]" />
      </span>
    );
  }
  if (m.type === "poll" && m.poll) return <PollView message={m} mine={mine} onVote={(i) => onVotePoll(m.id, i)} />;
  if (m.type === "image" && m.fileUrl) {
    return (
      <span className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.fileUrl} alt={m.fileName ?? "image"} onClick={() => onOpenImage(m.fileUrl!)} className="max-h-72 w-full cursor-zoom-in rounded-[12px] object-cover" />
        {m.content ? <span className="mt-1 block whitespace-pre-wrap break-words">{highlightMentions(m.content)}</span> : null}
      </span>
    );
  }
  if (m.type === "file" && m.fileUrl) {
    return (
      <a href={m.fileUrl} download={m.fileName} className="flex items-center gap-2 underline"><PaperclipIcon className="h-4 w-4 shrink-0" /> <span className="truncate">{m.fileName ?? "File"}</span></a>
    );
  }
  if (m.type === "location") return <span className="flex items-center gap-1.5"><MapPinIcon className="h-4 w-4" /> {m.content || "Shared a location"}</span>;
  // Emoji-only messages render big (jumbo), like Telegram.
  if (isOnlyEmoji(m.content)) return <span className="flex flex-wrap gap-0.5 leading-none">{renderEmoji(m.content, 44)}</span>;
  return <span className="whitespace-pre-wrap break-words">{highlightMentions(m.content)}</span>;
}

function Whisper({ message: m, mine }: { message: Message; mine: boolean }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <span className="whitespace-pre-wrap break-words">{highlightMentions(m.content)}</span>;
  return (
    <button onClick={() => setRevealed(true)} className={`flex items-center gap-2 italic ${mine ? "text-on-accent/80" : "text-ink-soft"}`}>
      <span className="select-none blur-[5px]">{m.content || "whisper whisper whisper"}</span>
      <EyeIcon className="h-4 w-4" />
    </button>
  );
}

function Ticks({ message: m }: { message: Message }) {
  if (m.pending) return <span className="text-[10px]">·</span>;
  if (m.status === "read") return <CheckCheckIcon className="h-3.5 w-3.5 text-[#bfe0ff]" />;
  if (m.status === "delivered") return <CheckCheckIcon className="h-3.5 w-3.5" />;
  return <CheckIcon className="h-3.5 w-3.5" />;
}

function groupReactions(m: Message, meId?: string): { emoji: string; count: number; mine: boolean }[] {
  if (!m.reactions?.length) return [];
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of m.reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, mine: false };
    cur.count++;
    if (r.userId === meId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, ...v }));
}

/** Short remaining-time label for a disappearing message. */
function fmtExpiry(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Bold @mentions inside message text. */
function highlightMentions(text: string) {
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span key={i} className="font-semibold text-accent-ink underline decoration-accent/40">{p}</span>
    ) : (
      <span key={i}>{renderEmoji(p)}</span>
    ),
  );
}
