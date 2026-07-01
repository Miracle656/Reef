"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildCreatePostTx, walrus } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { useGasless } from "@/lib/gasless";
import { PAIRS, type Pair } from "@/lib/deepbook";
import { listMarkets, toUsd } from "@/lib/predict";
import { toast } from "./toaster";
import { Button, Card, Spinner } from "./ui";

const MAX = 560;
const MAX_IMAGES = 2;

/** Shared composer. `withTokenize` shows the tokenize toggle (modal/full mode). */
export function ComposeForm({
  withTokenize = false,
  autoFocus = false,
  onPosted,
  replyTo,
  placeholder = "What's happening in Lagos?",
}: {
  withTokenize?: boolean;
  autoFocus?: boolean;
  onPosted?: () => void;
  replyTo?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenize, setTokenize] = useState(false);
  const [showPairs, setShowPairs] = useState(false);
  const [showMarkets, setShowMarkets] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const markets = useQuery({ queryKey: ["compose-markets"], queryFn: () => listMarkets(12), enabled: showMarkets });

  function shareTrade(p: Pair) {
    const ref = `${p.base}/${p.quote}`;
    setText((t) => (t.includes(ref) ? t : (t.trimEnd() + " " + ref).trimStart()));
    setShowPairs(false);
  }

  function shareMarket(oracleId: string) {
    const ref = `/m/${oracleId}`;
    setText((t) => (t.includes(ref) ? t : (t.trimEnd() + " " + ref).trimStart()));
    setShowMarkets(false);
  }
  const run = useGasless();
  const qc = useQueryClient();

  const canPost = (text.trim().length > 0 || files.length > 0) && text.length <= MAX && !busy;

  function pickFiles(list: FileList | null) {
    const incoming = Array.from(list ?? []);
    if (incoming.length === 0) return;
    const merged = [...files, ...incoming].slice(0, MAX_IMAGES); // append, cap at 2
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
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
      await run(buildCreatePostTx(umbraConfig, { text: text.trim(), media, replyTo: replyTo ?? null }));
      setText("");
      setFiles([]);
      setPreviews([]);
      toast(replyTo ? "Reply posted ✓ — appearing shortly" : "Posted ✓ — appearing shortly");
      // refetch now + again after the indexer ingests (~4s)
      const refresh = () => {
        qc.invalidateQueries({ queryKey: ["feed"] });
        qc.invalidateQueries({ queryKey: ["posts-by-author"] });
        if (replyTo) {
          qc.invalidateQueries({ queryKey: ["replies", replyTo] });
          qc.invalidateQueries({ queryKey: ["post-actions", replyTo] });
        }
      };
      refresh();
      setTimeout(refresh, 4500);
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
        placeholder={placeholder}
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
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={files.length >= MAX_IMAGES}
            className="text-sm font-medium text-ink-soft hover:text-accent disabled:opacity-40"
          >
            + Image{files.length > 0 ? ` (${files.length}/${MAX_IMAGES})` : ""}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              pickFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPairs((v) => !v)}
              className="text-sm font-medium text-ink-soft hover:text-accent"
            >
              + Trade
            </button>
            {showPairs ? (
              <div className="absolute bottom-full left-0 z-30 mb-2 max-h-60 w-44 overflow-y-auto rounded-2xl border border-[color:var(--glass-border)] bg-surface p-1 shadow-[var(--shadow-glass-lg)]">
                {PAIRS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => shareTrade(p)}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-surface-muted"
                  >
                    {p.base} <span className="text-ink-faint">/</span> {p.quote}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMarkets((v) => !v)}
              className="text-sm font-medium text-ink-soft hover:text-accent"
            >
              + Predict
            </button>
            {showMarkets ? (
              <div className="absolute bottom-full left-0 z-30 mb-2 max-h-60 w-56 overflow-y-auto rounded-2xl border border-[color:var(--glass-border)] bg-surface p-1 shadow-[var(--shadow-glass-lg)]">
                {markets.isLoading ? (
                  <div className="px-3 py-2 text-sm text-ink-faint">Loading markets…</div>
                ) : markets.data && markets.data.length > 0 ? (
                  markets.data.map((m) => (
                    <button
                      key={m.oracle_id}
                      type="button"
                      onClick={() => shareMarket(m.oracle_id)}
                      className="block w-full rounded-xl px-3 py-2 text-left hover:bg-surface-muted"
                    >
                      <span className="block text-sm font-semibold">{m.underlying_asset} prediction</span>
                      <span className="block font-mono text-[11px] text-ink-faint">
                        exp {new Date(m.expiry).toLocaleDateString()} · min ${toUsd(m.min_strike).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-ink-faint">No active markets</div>
                )}
              </div>
            ) : null}
          </div>
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
