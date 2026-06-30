"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar, Button } from "@/components/ui";
import { useMessaging } from "../lib/provider";
import type { StatusGroup } from "../lib/types";
import { PlusIcon, XIcon } from "./icons";

const BGS = ["#0a84ff", "#18c2c2", "#ff8a5b", "#15151a", "#7c3aed", "#e2554a"];

/** Horizontal stories rail shown above the chat list. */
export function StoriesBar() {
  const { listStatus, me } = useMessaging();
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [viewing, setViewing] = useState<StatusGroup | null>(null);
  const [composing, setComposing] = useState(false);

  const refresh = () => void listStatus().then(setGroups);
  useEffect(refresh, [listStatus]);

  const mine = groups.find((g) => g.user.id === me?.id);
  const others = groups.filter((g) => g.user.id !== me?.id);

  return (
    <div className="flex gap-3 overflow-x-auto border-b border-[color:var(--glass-border)] px-4 py-3">
      {/* add / your status */}
      <button onClick={() => setComposing(true)} className="flex shrink-0 flex-col items-center gap-1">
        <span className="relative grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-[color:var(--border-strong)]">
          <Avatar name={me?.username ?? "you"} src={me?.avatarUrl} size={48} />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-on-accent"><PlusIcon className="h-3 w-3" /></span>
        </span>
        <span className="max-w-[60px] truncate text-[11px] text-ink-soft">Your story</span>
      </button>

      {mine ? <StoryAvatar group={mine} label="You" onClick={() => setViewing(mine)} /> : null}
      {others.map((g) => (
        <StoryAvatar key={g.user.id} group={g} label={g.user.displayName || g.user.username} onClick={() => setViewing(g)} />
      ))}

      {viewing ? <StoryViewer group={viewing} onClose={() => { setViewing(null); refresh(); }} /> : null}
      {composing ? <StatusComposer onClose={() => { setComposing(false); refresh(); }} /> : null}
    </div>
  );
}

function StoryAvatar({ group, label, onClick }: { group: StatusGroup; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex shrink-0 flex-col items-center gap-1">
      <span className={`grid h-14 w-14 place-items-center rounded-full p-[2px] ${group.hasUnseen ? "bg-gradient-to-tr from-accent to-aqua" : "bg-surface-muted"}`}>
        <span className="rounded-full bg-surface p-[2px]">
          <Avatar name={group.user.username} src={group.user.avatarUrl} size={48} />
        </span>
      </span>
      <span className="max-w-[60px] truncate text-[11px] text-ink-soft">{label}</span>
    </button>
  );
}

function StoryViewer({ group, onClose }: { group: StatusGroup; onClose: () => void }) {
  const { viewStatus, deleteStatus, me } = useMessaging();
  const [idx, setIdx] = useState(0);
  const items = group.items;
  const cur = items[idx];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cur) return;
    void viewStatus(cur.id);
    timer.current = setTimeout(() => {
      if (idx < items.length - 1) setIdx(idx + 1);
      else onClose();
    }, 4500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cur?.id]);

  if (!cur) return null;
  const isMine = group.user.id === me?.id;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/90">
      <div className="relative flex h-full max-h-[90vh] w-full max-w-md flex-col">
        {/* progress bars */}
        <div className="flex gap-1 p-3">
          {items.map((s, i) => (
            <span key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <span className={`block h-full bg-white ${i < idx ? "w-full" : i === idx ? "w-full" : "w-0"}`} />
            </span>
          ))}
        </div>
        {/* header */}
        <div className="flex items-center gap-2 px-3">
          <Avatar name={group.user.username} src={group.user.avatarUrl} size={32} />
          <span className="text-[14px] font-semibold text-white">{isMine ? "You" : group.user.displayName || group.user.username}</span>
          <span className="flex-1" />
          {isMine ? (
            <button onClick={() => { void deleteStatus(cur.id); onClose(); }} aria-label="Delete" className="grid h-9 w-9 place-items-center rounded-full text-white/80 hover:bg-white/10">🗑</button>
          ) : null}
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-white/80 hover:bg-white/10"><XIcon className="h-5 w-5" /></button>
        </div>
        {/* body */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          {cur.type === "image" && cur.mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cur.mediaUrl} alt="story" className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="grid h-full w-full place-items-center px-8 text-center text-[26px] font-bold text-white" style={{ background: cur.bg ?? "#0a84ff" }}>
              {cur.content}
            </div>
          )}
          {/* tap zones */}
          <button aria-label="Previous" className="absolute inset-y-0 left-0 w-1/3" onClick={() => setIdx((i) => Math.max(0, i - 1))} />
          <button aria-label="Next" className="absolute inset-y-0 right-0 w-1/3" onClick={() => (idx < items.length - 1 ? setIdx(idx + 1) : onClose())} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatusComposer({ onClose }: { onClose: () => void }) {
  const { postStatus, uploadMedia } = useMessaging();
  const [text, setText] = useState("");
  const [bg, setBg] = useState(BGS[0]!);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);

  const postText = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await postStatus({ type: "text", content: text.trim(), bg });
    onClose();
  };

  const postImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const up = await uploadMedia(file);
    await postStatus({ type: "image", content: "", mediaUrl: up.url });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-[color:var(--glass-border)] bg-surface p-5 shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">New story</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted"><XIcon /></button>
        </div>
        <div className="mb-3 grid place-items-center rounded-2xl p-6 text-center text-[20px] font-bold text-white" style={{ background: bg }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type something…"
            rows={3}
            className="w-full resize-none bg-transparent text-center outline-none placeholder:text-white/70"
          />
        </div>
        <div className="mb-3 flex gap-2">
          {BGS.map((c) => (
            <button key={c} onClick={() => setBg(c)} className={`h-7 w-7 rounded-full ${bg === c ? "ring-2 ring-offset-2 ring-ink" : ""}`} style={{ background: c }} aria-label="bg" />
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void postText()} disabled={!text.trim() || busy} className="flex-1">Post text</Button>
          <Button variant="outline" onClick={() => imgRef.current?.click()} disabled={busy}>Photo</Button>
          <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => void postImage(e.target.files?.[0])} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
