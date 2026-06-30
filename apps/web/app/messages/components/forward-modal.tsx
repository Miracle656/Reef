"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui";
import { toast } from "@/components/toaster";
import { useMessaging } from "../lib/provider";
import { chatAvatar, chatName } from "../lib/display";
import type { Message } from "../lib/types";
import { SearchIcon, XIcon } from "./icons";

export function ForwardModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const { state, me, forwardMessage } = useMessaging();
  const [q, setQ] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());

  const chats = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = state.chats.filter((c) => !c.archived);
    return needle ? list.filter((c) => chatName(c, me?.id).toLowerCase().includes(needle)) : list;
  }, [state.chats, q, me?.id]);

  const forward = async (chatId: string) => {
    await forwardMessage(chatId, message);
    setSent((s) => new Set(s).add(chatId));
    toast("Forwarded ✓");
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-ink/40 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[color:var(--glass-border)] bg-surface p-5 shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Forward to…</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
            <XIcon />
          </button>
        </div>
        <div className="mb-2 flex items-center gap-2 rounded-full border border-[color:var(--glass-border)] bg-surface-glass px-3.5 py-2">
          <SearchIcon className="h-[17px] w-[17px] text-ink-faint" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="w-full bg-transparent text-[14px] outline-none placeholder:text-ink-faint" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {chats.map((c) => {
            const av = chatAvatar(c, me?.id);
            const done = sent.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => void forward(c.id)}
                disabled={done}
                className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-muted disabled:opacity-60"
              >
                <Avatar name={av.name} src={av.src} size={40} />
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{chatName(c, me?.id)}</span>
                {done ? <span className="text-[13px] font-semibold text-accent">Sent</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
