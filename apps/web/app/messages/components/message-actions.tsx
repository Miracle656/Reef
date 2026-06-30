"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Message } from "../lib/types";
import { useMessaging } from "../lib/provider";
import { EditIcon, ForwardIcon, ReplyIcon, TrashIcon } from "./icons";

const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function MessageActions({
  message,
  mine,
  onReply,
  onForward,
  onEdit,
  onClose,
}: {
  message: Message;
  mine: boolean;
  onReply: (m: Message) => void;
  onForward: (m: Message) => void;
  onEdit: (m: Message) => void;
  onClose: () => void;
}) {
  const { toggleReaction, deleteMessage, pinMessage, saveMessage } = useMessaging();
  const canEdit = mine && message.type === "text" && !message.isDeleted;
  const canDelete = mine && !message.isDeleted;

  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  const Item = ({ icon, label, danger, onClick }: { icon: ReactNode; label: string; danger?: boolean; onClick: () => void }) => (
    <button
      onClick={() => act(onClick)}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[14.5px] font-medium transition-colors hover:bg-surface-muted ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      <span className="text-ink-soft">{icon}</span>
      {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="mb-0 w-full max-w-sm rounded-t-3xl border border-[color:var(--glass-border)] bg-surface p-3 shadow-[var(--shadow-glass-lg)] sm:mb-0 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* quick reactions */}
        <div className="mb-2 flex items-center justify-around rounded-2xl bg-surface-muted/60 p-1.5">
          {QUICK.map((e) => (
            <button
              key={e}
              onClick={() => act(() => void toggleReaction(message, e))}
              className="lift grid h-10 w-10 place-items-center rounded-full text-[20px] hover:bg-surface"
            >
              {e}
            </button>
          ))}
        </div>

        <Item icon={<ReplyIcon />} label="Reply" onClick={() => onReply(message)} />
        <Item icon={<ForwardIcon />} label="Forward" onClick={() => onForward(message)} />
        <Item icon={<PinGlyph />} label={message.isPinned ? "Unpin" : "Pin"} onClick={() => void pinMessage(message.id, !message.isPinned)} />
        <Item icon={<BookmarkGlyph />} label="Save" onClick={() => void saveMessage(message.id)} />
        {message.content ? (
          <Item icon={<CopyGlyph />} label="Copy text" onClick={() => navigator.clipboard?.writeText(message.content)} />
        ) : null}
        {canEdit ? <Item icon={<EditIcon />} label="Edit" onClick={() => onEdit(message)} /> : null}
        {canDelete ? <Item icon={<TrashIcon />} label="Delete" danger onClick={() => void deleteMessage(message.id)} /> : null}
      </div>
    </div>,
    document.body,
  );
}

function CopyGlyph() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5M9 10.8 7 13h10l-2-2.2V4h-4v6.8z" />
    </svg>
  );
}

function BookmarkGlyph() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}
