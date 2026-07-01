"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { deepbook, walrus, type Post } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { shortAddr, timeAgo } from "@/lib/utils";
import { PAIRS, useDeepBook, type Pair } from "@/lib/deepbook";
import { getOracleState, toUsd } from "@/lib/predict";
import { renderEmoji, isOnlyEmoji } from "@/lib/emoji";
import { Avatar } from "./ui";
import { CoinIcon, PairIcons } from "./market-select";
import { ActionBar } from "./action-bar";

export function PostCard({ post }: { post: Post }) {
  const author = useQuery({
    queryKey: ["profile-by-addr", post.author],
    queryFn: () => trpc.profileByAddress.query({ address: post.author }),
  });
  const a = author.data;
  const handleHref = a ? `/u/${a.handle}` : "#";
  const verified = Boolean(a?.suinsName);
  const pair = post.text ? detectPair(post.text) : null;
  const market = post.text ? detectPredictMarket(post.text) : null;
  // Hide the raw /m/<id> link from the body — the embed card replaces it.
  const bodyText = market && post.text ? post.text.replace(/\/m\/[A-Za-z0-9_-]+(?:\?strike=[0-9.]+)?/, "").trim() : post.text;

  return (
    <article className="border-b border-[color:var(--glass-border)] px-5 py-4 transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_3%,transparent)]">
      <div className="flex gap-3">
        <Link href={handleHref} className="shrink-0">
          <Avatar name={a?.handle ?? post.author} src={a?.avatarBlobId ? walrus.urlFor(umbraConfig, a.avatarBlobId) : null} size={46} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link href={handleHref} className="truncate text-[15.5px] font-bold hover:underline">
              {a?.displayName ?? "Someone"}
            </Link>
            {verified ? <SealCheck /> : null}
            <Link href={handleHref} className="truncate font-mono text-[12.5px] text-ink-faint">
              @{a?.handle ?? shortAddr(post.author)}
            </Link>
            <span className="whitespace-nowrap font-mono text-[12.5px] text-ink-faint">· {timeAgo(post.createdAtMs)}</span>
            <Dots />
          </div>

          {bodyText ? (
            <Link href={`/p/${post.id}`} className="mt-1 block whitespace-pre-wrap break-words text-[15.5px] leading-[1.5] text-[#26262c]">
              {renderEmoji(bodyText, isOnlyEmoji(bodyText) ? 40 : 20)}
            </Link>
          ) : null}

          {post.media.length > 0 ? (
            <div className={`mt-3 grid gap-2 overflow-hidden rounded-[18px] ${post.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {post.media.map((blob) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={blob} src={walrus.urlFor(umbraConfig, blob)} alt="" className="max-h-80 w-full object-cover" />
              ))}
            </div>
          ) : null}

          {pair ? <TradeEmbed pair={pair} /> : null}
          {market ? <PredictEmbed id={market.id} strike={market.strike} /> : null}

          <ActionBar post={post} />
        </div>
      </div>
    </article>
  );
}

/** Inline trade card — shown when a post references a known pair (e.g. "WAL → DEEP"). */
function TradeEmbed({ pair }: { pair: Pair }) {
  const db = useDeepBook();
  const mid = useQuery({ queryKey: ["mid", pair.key], queryFn: () => deepbook.getMidPrice(db, pair.key), refetchInterval: 20000 });
  const price = mid.data;
  return (
    <div className="mt-3 flex items-center gap-3.5 rounded-[18px] border border-[color:var(--glass-border)] bg-surface-glass p-4">
      <PairIcons base={pair.base} quote={pair.quote} size={42} />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] text-ink-faint">{pair.base} → {pair.quote}</div>
        <div className="text-[18px] font-bold tabular-nums">
          {price != null ? (price < 1 ? price.toPrecision(4) : price.toLocaleString(undefined, { maximumFractionDigits: 2 })) : "—"}{" "}
          <span className="text-[13px] font-medium text-ink-faint">{pair.quote}</span>
        </div>
      </div>
      <Link href="/trade" className="rounded-full bg-accent px-4 py-2 text-[12.5px] font-bold text-on-accent">Trade</Link>
    </div>
  );
}

// ── Predict market embed ──────────────────────────────────────────────────────

const MODEL_VOL = 0.6;
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function impliedUpProb(forward: number, strike: number, ms: number): number {
  if (forward <= 0 || strike <= 0 || ms <= 0) return 0.5;
  const T = ms / (365.25 * 24 * 3600 * 1000);
  const sigT = MODEL_VOL * Math.sqrt(Math.max(T, 1e-9));
  const d2 = (Math.log(forward / strike) - 0.5 * MODEL_VOL * MODEL_VOL * T) / sigT;
  return Math.min(0.98, Math.max(0.02, normCdf(d2)));
}
const usd0 = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const usd2 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Extract a Predict market reference from post text: `/m/<oracleId>[?strike=<n>]`. */
function detectPredictMarket(text: string): { id: string; strike?: number } | null {
  const m = text.match(/\/m\/([A-Za-z0-9_-]+)(?:\?strike=([0-9.]+))?/);
  if (!m) return null;
  return { id: m[1]!, strike: m[2] ? Number(m[2]) : undefined };
}

/** Inline prediction-market card — live oracle price + implied YES%, taps to /m/[id]. */
function PredictEmbed({ id, strike }: { id: string; strike?: number }) {
  const q = useQuery({ queryKey: ["oracle", id], queryFn: () => getOracleState(id), refetchInterval: 20000 });
  const st = q.data;
  const asset = st?.oracle.underlying_asset ?? "BTC";
  const forward = st?.latest_price ? toUsd(st.latest_price.forward) : null;
  const expiry = st?.oracle.expiry;
  const yes = strike != null && forward != null && expiry != null ? impliedUpProb(forward, strike, expiry - Date.now()) : null;
  const href = strike != null ? `/m/${id}?strike=${strike}` : `/m/${id}`;

  return (
    <Link href={href} className="lift mt-3 flex items-center gap-3.5 rounded-[18px] border border-[color:var(--glass-border)] bg-surface-glass p-4 transition-colors hover:bg-surface-muted">
      <CoinIcon symbol={asset} size={44} />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] text-ink-faint">Prediction market</div>
        <div className="truncate text-[15px] font-bold">
          {strike != null ? `Will ${asset} be above ${usd0(strike)}?` : `${asset} price`}
        </div>
        <div className="truncate text-[12.5px] text-ink-soft">
          {forward != null ? `${asset} ${usd2(forward)}` : "Loading…"}
          {expiry ? ` · expires ${new Date(expiry).toLocaleDateString()}` : ""}
        </div>
      </div>
      {yes != null ? (
        <div className="shrink-0 text-right">
          <div className="text-[19px] font-bold tabular-nums text-accent-ink">{Math.round(yes * 100)}%</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">yes</div>
        </div>
      ) : null}
      <span className="shrink-0 rounded-full bg-accent px-4 py-2 text-[12.5px] font-bold text-on-accent">Predict</span>
    </Link>
  );
}

function detectPair(text: string): Pair | null {
  const up = text.toUpperCase();
  const sep = "\\s*(?:→|->|\\/|\\s+TO\\s+)\\s*";
  for (const p of PAIRS) {
    // match either order — "WAL/SUI" or "SUI/WAL" both resolve to the real pair.
    const a = new RegExp(`\\b${p.base}\\b${sep}\\b${p.quote}\\b`);
    const b = new RegExp(`\\b${p.quote}\\b${sep}\\b${p.base}\\b`);
    if (a.test(up) || b.test(up)) return p;
  }
  return null;
}

function SealCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#0A84FF" aria-label="verified" className="shrink-0">
      <path d="M12 1l2.4 1.8 3 .2 1 2.8 2.4 1.8-.8 2.9.8 2.9-2.4 1.8-1 2.8-3 .2L12 23l-2.4-1.8-3-.2-1-2.8L3.2 16.4 4 13.5l-.8-2.9 2.4-1.8 1-2.8 3-.2z" />
      <path d="M9.5 12.5l1.8 1.8 3.5-3.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dots() {
  return (
    <svg className="ml-auto shrink-0 text-ink-faint" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
