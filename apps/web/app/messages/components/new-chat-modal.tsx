"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar, Button, Spinner } from "@/components/ui";
import { useMessaging } from "../lib/provider";
import type { Participant } from "../lib/types";
import { CheckIcon, SearchIcon, XIcon } from "./icons";
import { toast } from "@/components/toaster";

export function NewChatModal({ mode, onClose }: { mode: "direct" | "group"; onClose: () => void }) {
  const { searchUsers, startDirect, createGroup } = useMessaging();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Participant[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults([]);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchUsers(needle);
      if (live) {
        setResults(r);
        setLoading(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, searchUsers]);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);

  const choose = async (u: Participant) => {
    if (mode === "direct") {
      if (busy) return;
      setBusy(true);
      try {
        await startDirect(u.id);
        onClose();
      } catch (e) {
        console.error("[new-chat] startDirect failed:", e);
        toast(e instanceof Error ? e.message : "Couldn't start chat");
        setBusy(false);
      }
    } else {
      setPicked((prev) => (pickedIds.has(u.id) ? prev.filter((p) => p.id !== u.id) : [...prev, u]));
    }
  };

  const submitGroup = async () => {
    if (!groupName.trim() || picked.length === 0) return;
    setBusy(true);
    try {
      await createGroup({ name: groupName.trim(), participantIds: picked.map((p) => p.id) });
      onClose();
    } catch (e) {
      console.error("[new-chat] createGroup failed:", e);
      toast(e instanceof Error ? e.message : "Couldn't create group");
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/40 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[color:var(--glass-border)] bg-surface p-5 shadow-[var(--shadow-glass-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {busy && mode === "direct" ? (
          <div className="absolute inset-0 z-10 grid place-items-center gap-2 bg-surface/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Spinner />
              <p className="text-sm font-medium text-ink-soft">Starting chat…</p>
            </div>
          </div>
        ) : null}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{mode === "direct" ? "New message" : "New group"}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
            <XIcon />
          </button>
        </div>

        {mode === "group" ? (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            className="mb-2 h-11 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-glass px-4 text-[15px] outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
          />
        ) : null}

        {mode === "group" && picked.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <button
                key={p.id}
                onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
                className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[12.5px] font-semibold text-accent-ink"
              >
                {p.displayName || p.username} <XIcon className="h-3 w-3" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="mb-2 flex items-center gap-2 rounded-full border border-[color:var(--glass-border)] bg-surface-glass px-3.5 py-2">
          <SearchIcon className="h-[17px] w-[17px] text-ink-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-ink-faint"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid place-items-center py-8"><Spinner /></div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">{q ? "No people found." : "Search by name or handle."}</p>
          ) : (
            results.map((u) => (
              <button
                key={u.id}
                onClick={() => void choose(u)}
                className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-muted ${
                  pickedIds.has(u.id) ? "bg-accent/10" : ""
                }`}
              >
                <Avatar name={u.username} src={u.avatarUrl} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{u.displayName || u.username}</span>
                  <span className="block truncate font-mono text-[12px] text-ink-faint">@{u.username}</span>
                </span>
                {mode === "group" && pickedIds.has(u.id) ? <CheckIcon className="h-4 w-4 text-accent" /> : null}
              </button>
            ))
          )}
        </div>

        {mode === "group" ? (
          <Button onClick={() => void submitGroup()} disabled={!groupName.trim() || picked.length === 0 || busy} className="mt-3 w-full">
            {busy ? <Spinner className="border-on-accent" /> : null}
            Create group{picked.length ? ` · ${picked.length}` : ""}
          </Button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
