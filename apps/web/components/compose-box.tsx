"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildCreatePostTx, walrus } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { useGasless } from "@/lib/gasless";
import { Button, Card, Spinner } from "./ui";

const MAX = 560;

export function ComposeBox() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenize, setTokenize] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useGasless();
  const qc = useQueryClient();

  const canPost = (text.trim().length > 0 || files.length > 0) && text.length <= MAX && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const media: string[] = [];
      for (const f of files.slice(0, 4)) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const { blobId } = await walrus.upload(umbraConfig, bytes);
        media.push(blobId);
      }
      await run(buildCreatePostTx(umbraConfig, { text: text.trim(), media }));
      setText("");
      setFiles([]);
      await qc.invalidateQueries({ queryKey: ["feed"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <textarea
        rows={3}
        value={text}
        maxLength={MAX}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening in Lagos?"
        className="w-full resize-none bg-transparent text-[15px] placeholder:text-ink-faint focus:outline-none"
      />
      {files.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="rounded-full border border-[color:var(--glass-border)] bg-surface-muted px-3 py-1 text-xs">
              {f.name}
            </span>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sm font-medium text-ink-soft hover:text-accent"
          >
            + Image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 4))}
          />
          <span className={`text-xs ${text.length > MAX ? "text-danger" : "text-ink-faint"}`}>
            {text.length}/{MAX}
          </span>
        </div>
        <Button size="sm" disabled={!canPost} onClick={submit}>
          {busy ? <Spinner className="border-on-ink" /> : null}
          Post
        </Button>
      </div>

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
          Mints a coin + a DEEP pool for this post (you own it) — needs 500 DEEP in your linked wallet. Minting
          engine is the next build; for now this posts normally.
        </p>
      ) : null}
    </Card>
  );
}
