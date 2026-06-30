"use client";

import { useEffect, useState } from "react";
import { useMessaging } from "../lib/provider";
import { timeShort } from "../lib/format";
import type { Message } from "../lib/types";
import { SearchIcon, XIcon } from "./icons";

export function SearchPanel({ chatId, onClose, onJump }: { chatId: string; onClose: () => void; onJump: (messageId: string) => void }) {
  const { searchMessages } = useMessaging();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Message[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults([]);
      setSearched(false);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchMessages(chatId, needle);
      if (live) {
        setResults(r);
        setSearched(true);
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, chatId, searchMessages]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-[color:var(--glass-border)] px-3 py-2.5">
        <SearchIcon className="h-[17px] w-[17px] text-ink-faint" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in conversation" className="w-full bg-transparent text-[14.5px] outline-none placeholder:text-ink-faint" />
        <button onClick={onClose} aria-label="Close search" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
          <XIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {searched && results.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">No matches.</p>
        ) : (
          results.map((m) => (
            <button
              key={m.id}
              onClick={() => onJump(m.id)}
              className="flex w-full flex-col gap-0.5 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-muted"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-ink">{m.sender?.displayName || m.sender?.username || "You"}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">{timeShort(m.createdAt)}</span>
              </span>
              <span className="truncate text-[13.5px] text-ink-soft">{m.content}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
