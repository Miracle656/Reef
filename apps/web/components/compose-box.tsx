"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildCreatePostTx, walrus } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { useGasless } from "@/lib/gasless";
import { Button, Card, Spinner } from "./ui";

const MAX = 560;

/** Shared composer. `withTokenize` shows the tokenize toggle (modal/full mode). */
export function ComposeForm({
  withTokenize = false,
  autoFocus = false,
  onPosted,
}: {
  withTokenize?: boolean;
  autoFocus?: boolean;
  onPosted?: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenize, setTokenize] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useGasless();
  const qc = useQueryClient();

  const canPost = (text.trim().length > 0 || files.length > 0) && text.length <= MAX && !busy;

  function pickFiles(list: FileList | null) {
    previews.forEach((u) => URL.revokeObjectURL(u));
    const arr = Array.from(list ?? []).slice(0, 4);
    setFiles(arr);
    setPreviews(arr.map((f) => URL.createObjectURL(f)));
  }
  function removeAt(i: number) {
    setFiles((f) => f.filter((_, j) => j !== i));
    setPreviews((p) => {
      const u = p[i];
      if (u) URL.revokeObjectURL(u);
      return p.filter((_, j) => j !== i);
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const media: string[] = [];
      for (const f of files.slice(0, 4)) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        media.push((await walrus.upload(umbraConfig, bytes)).blobId);
      }
      await run(buildCreatePostTx(umbraConfig, { text: text.trim(), media }));
      setText("");
      setFiles([]);
      setPreviews([]);
      await qc.invalidateQueries({ queryKey: ["feed"] });
      onPosted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <textarea
        autoFocus={autoFocus}
        rows={3}
        value={text}
        maxLength={MAX}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening in Lagos?"
        className="w-full resize-none bg-transparent text-[15px] placeholder:text-ink-faint focus:outline-none"
      />

      {previews.length > 0 ? (
        <div className={`mt-2 grid gap-2 ${previews.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {previews.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="max-h-72 w-full rounded-xl border border-[color:var(--glass-border)] bg-surface-muted object-contain" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-xs text-white"
                aria-label="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-medium text-ink-soft hover:text-accent">
            + Image
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => pickFiles(e.target.files)} />
          <span className={`text-xs ${text.length > MAX ? "text-danger" : "text-ink-faint"}`}>{text.length}/{MAX}</span>
        </div>
        <Button size="sm" disabled={!canPost} onClick={submit}>
          {busy ? <Spinner className="border-on-ink" /> : null}
          Post
        </Button>
      </div>

      {withTokenize ? (
        <>
          <button
            type="button"
            onClick={() => setTokenize((t) => !t)}
            className="mt-3 flex w-full items-center justify-between rounded-2xl border border-[color:var(--glass-border)] bg-surface-muted px-3 py-2 text-left"
          >
            <span className="flex items-center gap-2 text-sm">
              <span aria-hidden>🪙</span>
              <span>
                <span className="font-medium">Tokenize</span> — make this post a tradable coin
              </span>
            </span>
            <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${tokenize ? "bg-accent" : "bg-ink-faint/40"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${tokenize ? "left-[22px]" : "left-0.5"}`} />
            </span>
          </button>
          {tokenize ? (
            <p className="mt-1 text-xs text-ink-faint">
              Mints a coin + DEEP pool for this post (you own it) — needs 500 DEEP in your linked wallet. Minting
              engine is the next build; posts normally for now.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Inline quick-post box (home feed) — text + image, no tokenize. */
export function ComposeBox() {
  return (
    <Card className="p-4">
      <ComposeForm />
    </Card>
  );
}
