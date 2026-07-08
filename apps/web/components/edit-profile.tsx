"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildUpdateProfileTx, walrus, type Profile } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { useGasless } from "@/lib/gasless";
import { useSocialAccount } from "@/lib/account";
import { toast } from "./toaster";
import { Avatar, Button, Spinner } from "./ui";

/** "Edit profile" button + modal — only renders on your own profile. */
export function EditProfileButton({ profile }: { profile: Profile }) {
  const account = useSocialAccount();
  const [open, setOpen] = useState(false);
  if (!account || account.address !== profile.owner) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit profile
      </Button>
      {open ? <EditProfileModal profile={profile} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function EditProfileModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useGasless();
  const qc = useQueryClient();

  const currentAvatar = profile.avatarBlobId ? walrus.urlFor(umbraConfig, profile.avatarBlobId) : null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      let avatarBlobId = profile.avatarBlobId ?? null;
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        avatarBlobId = (await walrus.upload(umbraConfig, bytes)).blobId;
      }
      await run(
        buildUpdateProfileTx(umbraConfig, {
          profileId: profile.id,
          displayName: displayName.trim() || profile.handle,
          bio: bio.trim(),
          avatarBlobId,
        }),
      );
      toast("Profile updated ✓ — changes appear shortly");
      // refresh now + after the indexer ingests the ProfileUpdated event
      const bump = () =>
        ["profile-by-handle", "profile-by-addr"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      bump();
      setTimeout(bump, 4000);
      setTimeout(bump, 8000);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-[color:var(--glass-border)] bg-surface p-6 shadow-[var(--shadow-glass-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black tracking-tight">Edit profile</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
            ✕
          </button>
        </div>

        {/* avatar with the same plus-badge affordance as onboarding */}
        <button type="button" onClick={() => fileRef.current?.click()} className="relative mx-auto block rounded-full" aria-label="Change profile picture">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <Avatar name={profile.handle} src={currentAvatar} size={96} />
          )}
          <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full bg-accent text-on-accent ring-2 ring-[color:var(--surface)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (preview) URL.revokeObjectURL(preview);
            setFile(f);
            setPreview(URL.createObjectURL(f));
            e.currentTarget.value = "";
          }}
        />

        <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-ink-faint">Display name</label>
        <input
          value={displayName}
          maxLength={50}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-2xl border border-[color:var(--glass-border)] bg-surface-muted px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-accent"
        />

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint">Bio</label>
        <textarea
          value={bio}
          rows={3}
          maxLength={160}
          onChange={(e) => setBio(e.target.value)}
          className="mt-1 w-full resize-none rounded-2xl border border-[color:var(--glass-border)] bg-surface-muted px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="mt-1 text-right text-xs text-ink-faint">{bio.length}/160</div>

        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !displayName.trim()}>
            {busy ? <Spinner className="border-on-ink" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
