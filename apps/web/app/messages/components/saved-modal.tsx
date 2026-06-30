"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar, Spinner } from "@/components/ui";
import { useMessaging } from "../lib/provider";
import { timeShort } from "../lib/format";
import type { Message } from "../lib/types";
import { XIcon } from "./icons";

export function SavedModal({ onClose }: { onClose: () => void }) {
  const { listSaved, unsaveMessage } = useMessaging();
  const [items, setItems] = useState<Message[] | null>(null);

  useEffect(() => {
    void listSaved().then(setItems);
  }, [listSaved]);

  const remove = async (id: string) => {
    await unsaveMessage(id);
    setItems((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-ink/40 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[color:var(--glass-border)] bg-surface p-5 shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Saved messages</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted"><XIcon /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items === null ? (
            <div className="grid place-items-center py-10"><Spinner /></div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-faint">Nothing saved yet. Save a message from its menu.</p>
          ) : (
            items.map((m) => (
              <div key={m.id} className="flex items-start gap-3 rounded-2xl px-2.5 py-2.5 hover:bg-surface-muted">
                <Avatar name={m.sender?.username ?? "?"} src={m.sender?.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold">{m.sender?.displayName || m.sender?.username || "You"}</span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-faint">{timeShort(m.createdAt)}</span>
                  </div>
                  <p className="truncate text-[13.5px] text-ink-soft">{m.content || (m.type === "image" ? "📷 Photo" : m.type === "file" ? "📎 File" : "media")}</p>
                </div>
                <button onClick={() => void remove(m.id)} aria-label="Unsave" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-surface"><XIcon className="h-4 w-4" /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
