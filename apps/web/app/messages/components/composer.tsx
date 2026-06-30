"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMessaging } from "../lib/provider";
import type { Message, Participant } from "../lib/types";
import { PollComposer } from "./poll-composer";
import { ImageIcon, PaperclipIcon, PlusIcon, SendIcon, XIcon } from "./icons";

export function Composer({
  chatId,
  participants = [],
  allowAsides = false,
  meId,
  replyTo,
  replyName,
  editing,
  onCancelReply,
  onCancelEdit,
}: {
  chatId: string;
  participants?: Participant[];
  allowAsides?: boolean;
  meId?: string;
  replyTo?: Message | null;
  replyName?: string;
  editing?: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}) {
  const { send, editMessage, setTyping, uploadMedia } = useMessaging();
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [whisper, setWhisper] = useState(false);
  const [asideOn, setAsideOn] = useState(false);
  const [asideAudience, setAsideAudience] = useState<Set<string>>(new Set());
  const [pollOpen, setPollOpen] = useState(false);
  const otherMembers = participants.filter((p) => p.id !== meId);
  const [busy, setBusy] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const viewOnceRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editing) {
      setText(editing.content);
      taRef.current?.focus();
    }
  }, [editing]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return participants.filter((p) => p.username.toLowerCase().includes(q) || (p.displayName ?? "").toLowerCase().includes(q)).slice(0, 5);
  }, [mentionQuery, participants]);

  const grow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  };

  const detectMention = (v: string) => {
    const m = /(?:^|\s)@([a-zA-Z0-9_]*)$/.exec(v);
    setMentionQuery(m ? m[1] ?? "" : null);
  };

  const onChange = (v: string) => {
    setText(v);
    grow();
    detectMention(v);
    if (!editing) {
      setTyping(chatId, true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(chatId, false), 2000);
    }
  };

  const pickMention = (p: Participant) => {
    setText((prev) => prev.replace(/@([a-zA-Z0-9_]*)$/, `@${p.username} `));
    setMentionQuery(null);
    taRef.current?.focus();
  };

  const reset = () => {
    setText("");
    setWhisper(false);
    setAsideOn(false);
    setAsideAudience(new Set());
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const resolveMentionIds = (content: string): string[] => {
    const ids: string[] = [];
    for (const m of content.matchAll(/@([a-zA-Z0-9_]+)/g)) {
      const handle = m[1];
      if (!handle) continue;
      const u = participants.find((p) => p.username.toLowerCase() === handle.toLowerCase());
      if (u) ids.push(u.id);
    }
    return ids;
  };

  const submit = async () => {
    const content = text.trim();
    if (!content) return;
    if (editing) {
      reset();
      onCancelEdit();
      await editMessage(editing.id, content);
      return;
    }
    const replyId = replyTo?.id;
    const mentionIds = resolveMentionIds(content);
    const wasWhisper = whisper;
    const audienceIds = asideOn && asideAudience.size ? [...asideAudience] : undefined;
    reset();
    setTyping(chatId, false);
    onCancelReply();
    await send({ chatId, content, type: "text", replyToId: replyId, isWhisper: wasWhisper, mentionIds, audienceIds });
  };

  const onPickFile = async (file: File | undefined, kind: "image" | "file", viewOnce = false) => {
    setAttachOpen(false);
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadMedia(file);
      await send({ chatId, type: kind, content: "", fileUrl: up.url, fileName: up.name, fileSize: up.size, mimeType: up.mimeType, replyToId: replyTo?.id, viewOnce });
      onCancelReply();
    } finally {
      setBusy(false);
    }
  };

  const shareLocation = () => {
    setAttachOpen(false);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => void send({ chatId, type: "location", content: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` }),
      () => void send({ chatId, type: "location", content: "Location unavailable" }),
    );
  };

  const attachItem = "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[14px] hover:bg-surface-muted";

  return (
    <div className="relative border-t border-[color:var(--glass-border)] bg-[color:color-mix(in_srgb,var(--surface)_82%,transparent)] backdrop-blur-xl">
      {/* mention autocomplete */}
      {mentionMatches.length ? (
        <div className="absolute bottom-full left-3 mb-1 w-60 overflow-hidden rounded-2xl border border-[color:var(--glass-border)] bg-surface p-1.5 shadow-[var(--shadow-glass-lg)]">
          {mentionMatches.map((p) => (
            <button key={p.id} onClick={() => pickMention(p)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-surface-muted">
              <span className="font-semibold text-[13.5px]">{p.displayName || p.username}</span>
              <span className="font-mono text-[12px] text-ink-faint">@{p.username}</span>
            </button>
          ))}
        </div>
      ) : null}

      {asideOn ? (
        <div className="border-b border-[color:var(--glass-border)] px-3 py-2">
          <div className="mb-1 text-[11px] font-semibold text-accent-ink">🔒 Aside — only these members can read it:</div>
          <div className="flex flex-wrap gap-1.5">
            {otherMembers.map((p) => {
              const on = asideAudience.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    setAsideAudience((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-[12.5px] font-medium ${on ? "border-accent bg-accent/15 text-accent-ink" : "border-[color:var(--glass-border)] text-ink-soft"}`}
                >
                  {p.displayName || p.username}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {(replyTo || editing) ? (
        <div className="flex items-center gap-2 border-b border-[color:var(--glass-border)] px-4 py-2">
          <span className="h-8 w-0.5 rounded bg-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-accent-ink">{editing ? "Editing message" : `Replying to ${replyName ?? ""}`}</div>
            <div className="truncate text-[12.5px] text-ink-soft">{(editing ?? replyTo)?.content || "media"}</div>
          </div>
          <button onClick={() => (editing ? onCancelEdit() : onCancelReply())} aria-label="Cancel" className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-1.5 px-3 py-3">
        {/* attach */}
        <div className="relative">
          <button type="button" onClick={() => setAttachOpen((o) => !o)} disabled={!!editing || busy} aria-label="Attach" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-muted disabled:opacity-40">
            <PlusIcon className="h-5 w-5" />
          </button>
          {attachOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAttachOpen(false)} />
              <div className="absolute bottom-12 left-0 z-20 w-48 overflow-hidden rounded-2xl border border-[color:var(--glass-border)] bg-surface p-1.5 shadow-[var(--shadow-glass-lg)]">
                <button onClick={() => imgRef.current?.click()} className={attachItem}><ImageIcon className="h-4 w-4 text-ink-soft" /> Photo</button>
                <button onClick={() => viewOnceRef.current?.click()} className={attachItem}>👁 View-once photo</button>
                <button onClick={() => fileRef.current?.click()} className={attachItem}><PaperclipIcon className="h-4 w-4 text-ink-soft" /> File</button>
                <button onClick={() => { setAttachOpen(false); setPollOpen(true); }} className={attachItem}>📊 Poll</button>
                <button onClick={shareLocation} className={attachItem}>📍 Location</button>
              </div>
            </>
          ) : null}
          <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => void onPickFile(e.target.files?.[0], "image")} />
          <input ref={viewOnceRef} type="file" accept="image/*" hidden onChange={(e) => void onPickFile(e.target.files?.[0], "image", true)} />
          <input ref={fileRef} type="file" hidden onChange={(e) => void onPickFile(e.target.files?.[0], "file")} />
        </div>

        {/* whisper toggle */}
        {!editing ? (
          <button
            type="button"
            onClick={() => setWhisper((w) => !w)}
            aria-label="Whisper"
            title="Whisper — blurred until tapped"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${whisper ? "bg-accent/15 text-accent-ink" : "text-ink-soft hover:bg-surface-muted"}`}
          >
            👁
          </button>
        ) : null}

        {/* aside toggle (group + admin-enabled) */}
        {!editing && allowAsides && otherMembers.length ? (
          <button
            type="button"
            onClick={() => setAsideOn((a) => !a)}
            aria-label="Aside"
            title="Aside — private message to selected members"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${asideOn ? "bg-accent/15 text-accent-ink" : "text-ink-soft hover:bg-surface-muted"}`}
          >
            🔒
          </button>
        ) : null}

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape" && editing) onCancelEdit();
          }}
          rows={1}
          placeholder={busy ? "Uploading…" : editing ? "Edit message" : whisper ? "Whisper…" : "Message"}
          disabled={busy}
          className="max-h-[140px] min-h-[44px] w-0 flex-1 resize-none rounded-[20px] border border-[color:var(--glass-border)] bg-surface-glass px-4 py-2.5 text-[14.5px] outline-none backdrop-blur-xl placeholder:text-ink-faint focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
        />
        <button type="button" onClick={() => void submit()} disabled={!text.trim() || busy} aria-label={editing ? "Save" : "Send"} className="lift grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-glass)] disabled:opacity-40">
          <SendIcon className="h-5 w-5" />
        </button>
      </div>

      {pollOpen ? <PollComposer chatId={chatId} onClose={() => setPollOpen(false)} /> : null}
    </div>
  );
}
