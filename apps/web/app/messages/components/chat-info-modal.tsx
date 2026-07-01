"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar, Button } from "@/components/ui";
import { toast } from "@/components/toaster";
import { useMessaging } from "../lib/provider";
import { chatAvatar, chatName, peerOf } from "../lib/display";
import type { Chat, Participant } from "../lib/types";
import { PlusIcon, SearchIcon, XIcon } from "./icons";

export function ChatInfoModal({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const { me, updateGroup, addParticipants, removeParticipant, setAdmin, leaveGroup, setChatSettings, setChatVaulted, blockUser, unblockUser, listBlocked, reportUser } = useMessaging();
  const isGroup = chat.type === "group";
  const meId = me?.id;
  const iAmAdmin = isGroup && (chat.adminIds ?? []).includes(meId ?? "");
  const av = chatAvatar(chat, meId);
  const peer = peerOf(chat, meId);

  const [name, setName] = useState(chat.name ?? "");
  const [desc, setDesc] = useState(chat.description ?? "");
  const [adding, setAdding] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!peer) return;
    void listBlocked().then((list) => setBlocked(list.some((u) => u.id === peer.id)));
  }, [peer, listBlocked]);

  const toggleBlock = async () => {
    if (!peer) return;
    if (blocked) {
      await unblockUser(peer.id);
      setBlocked(false);
      toast("Unblocked");
    } else {
      await blockUser(peer.id);
      setBlocked(true);
      toast("Blocked");
      onClose();
    }
  };

  const report = () => {
    if (!peer) return;
    const reason = window.prompt(`Report @${peer.username}? Add a reason (optional):`);
    if (reason === null) return;
    void reportUser(peer.id, reason, chat.id).then(() => toast("Report submitted"));
  };

  const saveMeta = async () => {
    if (name.trim() && (name !== chat.name || desc !== chat.description)) {
      await updateGroup(chat.id, { name: name.trim(), description: desc.trim() });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center bg-ink/40 p-4 pt-12 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[color:var(--glass-border)] bg-surface shadow-[var(--shadow-glass-lg)]" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-lg font-bold">{isGroup ? "Group info" : "Contact info"}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
            <XIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {/* identity */}
          <div className="flex flex-col items-center gap-2 py-3">
            <Avatar name={av.name} src={av.src} size={84} />
            {isGroup && iAmAdmin ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void saveMeta()}
                className="w-full rounded-xl border border-[color:var(--glass-border)] bg-surface-glass px-3 py-1.5 text-center text-[18px] font-bold outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
              />
            ) : (
              <h3 className="text-[20px] font-bold">{chatName(chat, meId)}</h3>
            )}
            {!isGroup && peer ? <p className="font-mono text-[13px] text-ink-faint">@{peer.username}</p> : null}
            {isGroup && iAmAdmin ? (
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={() => void saveMeta()}
                placeholder="Add a description"
                rows={2}
                className="w-full resize-none rounded-xl border border-[color:var(--glass-border)] bg-surface-glass px-3 py-2 text-center text-[13.5px] outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
              />
            ) : chat.description ? (
              <p className="text-center text-[13.5px] text-ink-soft">{chat.description}</p>
            ) : null}
            {!isGroup && peer?.bio ? <p className="text-center text-[13.5px] text-ink-soft">{peer.bio}</p> : null}
          </div>

          {/* settings */}
          <div className="my-2 space-y-1 rounded-2xl border border-[color:var(--glass-border)] p-1.5">
            <Toggle label="Mute notifications" checked={!!chat.muted} onChange={(v) => void setChatSettings(chat.id, { muted: v })} />
            <Toggle label="Archive chat" checked={!!chat.archived} onChange={(v) => void setChatSettings(chat.id, { archived: v })} />
            <Toggle label="Keep in Vault" checked={!!chat.vaulted} onChange={(v) => void setChatVaulted(chat.id, v)} />
            {isGroup && iAmAdmin ? (
              <>
                <Toggle label="Allow asides (private msgs)" checked={!!chat.allowAsides} onChange={(v) => void updateGroup(chat.id, { allowAsides: v })} />
                <Toggle label="Allow the Chosen game" checked={!!chat.allowChosen} onChange={(v) => void updateGroup(chat.id, { allowChosen: v })} />
              </>
            ) : null}
          </div>

          {/* members */}
          {isGroup ? (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">{chat.participants.length} members</span>
                {iAmAdmin ? (
                  <button onClick={() => setAdding((a) => !a)} className="flex items-center gap-1 text-[13px] font-semibold text-accent">
                    <PlusIcon className="h-4 w-4" /> Add
                  </button>
                ) : null}
              </div>

              {adding ? <AddMembers chat={chat} onAdd={(ids) => void addParticipants(chat.id, ids).then(() => setAdding(false))} /> : null}

              <div className="space-y-0.5">
                {chat.participants.map((p) => {
                  const admin = (chat.adminIds ?? []).includes(p.id);
                  const isMe = p.id === meId;
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-muted">
                      <Avatar name={p.username} src={p.avatarUrl} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{p.displayName || p.username}{isMe ? " (you)" : ""}</span>
                        <span className="block truncate font-mono text-[11.5px] text-ink-faint">@{p.username}</span>
                      </span>
                      {admin ? <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent-ink">admin</span> : null}
                      {iAmAdmin && !isMe ? <MemberMenu admin={admin} onToggleAdmin={() => void setAdmin(chat.id, p.id, !admin)} onRemove={() => void removeParticipant(chat.id, p.id)} /> : null}
                    </div>
                  );
                })}
              </div>

              <Button variant="danger" onClick={() => void leaveGroup(chat.id).then(onClose)} className="mt-4 w-full">
                Leave group
              </Button>
            </div>
          ) : null}

          {/* direct chat: block / report */}
          {!isGroup && peer ? (
            <div className="mt-3 space-y-2">
              <button onClick={() => void toggleBlock()} className={`w-full rounded-2xl border px-4 py-2.5 text-left text-[14px] font-semibold ${blocked ? "border-[color:var(--glass-border)] text-ink" : "border-danger/40 text-danger"}`}>
                {blocked ? `Unblock @${peer.username}` : `Block @${peer.username}`}
              </button>
              <button onClick={report} className="w-full rounded-2xl border border-danger/40 px-4 py-2.5 text-left text-[14px] font-semibold text-danger">
                Report @{peer.username}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[14px] hover:bg-surface-muted">
      <span>{label}</span>
      <span className={`relative h-6 w-10 rounded-full transition-colors ${checked ? "bg-accent" : "bg-surface-muted"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function MemberMenu({ admin, onToggleAdmin, onRemove }: { admin: boolean; onToggleAdmin: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Member actions" className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:bg-surface">
        ⋯
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-2xl border border-[color:var(--glass-border)] bg-surface p-1.5 shadow-[var(--shadow-glass-lg)]">
            <button onClick={() => { onToggleAdmin(); setOpen(false); }} className="block w-full rounded-xl px-2.5 py-2 text-left text-[13.5px] hover:bg-surface-muted">
              {admin ? "Dismiss as admin" : "Make admin"}
            </button>
            <button onClick={() => { onRemove(); setOpen(false); }} className="block w-full rounded-xl px-2.5 py-2 text-left text-[13.5px] text-danger hover:bg-surface-muted">
              Remove
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function AddMembers({ chat, onAdd }: { chat: Chat; onAdd: (ids: string[]) => void }) {
  const { searchUsers } = useMessaging();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Participant[]>([]);
  const have = new Set(chat.participants.map((p) => p.id));

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults([]);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchUsers(needle);
      if (live) setResults(r.filter((u) => !have.has(u.id)));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, searchUsers]);

  return (
    <div className="mb-2 rounded-2xl border border-[color:var(--glass-border)] p-2">
      <div className="mb-1.5 flex items-center gap-2 rounded-full bg-surface-glass px-3 py-1.5">
        <SearchIcon className="h-4 w-4 text-ink-faint" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add people" className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint" />
      </div>
      {results.map((u) => (
        <button key={u.id} onClick={() => onAdd([u.id])} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-muted">
          <Avatar name={u.username} src={u.avatarUrl} size={32} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{u.displayName || u.username}</span>
          <PlusIcon className="h-4 w-4 text-accent" />
        </button>
      ))}
    </div>
  );
}
