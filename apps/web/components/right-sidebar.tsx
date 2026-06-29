"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { deepbook, walrus } from "@umbra/core";
import { useSocialAccount } from "@/lib/account";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { PAIRS, useDeepBook } from "@/lib/deepbook";
import { getOracleState, getOracleTrades, listMarkets, toUsd } from "@/lib/predict";
import { Avatar, Card } from "./ui";
import { PairIcons } from "./market-select";
import { FollowButton } from "./follow-button";

const FAINT = "#9A9AA6";
const fmtPrice = (p: number) => (p === 0 ? "—" : p < 1 ? p.toPrecision(4) : p.toLocaleString(undefined, { maximumFractionDigits: 2 }));
const usd0 = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// implied P(up) — lognormal forward model, mirrors the market page.
function impliedUpProb(forward: number, strike: number, ms: number): number {
  if (forward <= 0 || strike <= 0 || ms <= 0) return 0.5;
  const T = ms / (365.25 * 24 * 3600 * 1000);
  const sig = 0.6 * Math.sqrt(Math.max(T, 1e-9));
  const d2 = (Math.log(forward / strike) - 0.18 * T) / sig;
  const t = 1 / (1 + 0.2316419 * Math.abs(d2));
  const d = 0.3989422804014327 * Math.exp((-d2 * d2) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = d2 >= 0 ? 1 - p : p;
  return Math.min(0.98, Math.max(0.02, cdf));
}

export function RightSidebar() {
  return (
    <div className="flex flex-col">
      {/* pinned search — stays put while the rest of the panel scrolls */}
      <div className="sticky top-0 z-10 bg-background pb-[18px]">
        <Link
          href="/search"
          className="flex items-center gap-3 rounded-full border border-[color:var(--glass-border)] bg-surface-glass px-[18px] py-3 text-ink-faint backdrop-blur-md transition-colors hover:text-ink-soft"
        >
          <SearchGlyph />
          <span className="text-[15px]">Search people &amp; pairs</span>
        </Link>
      </div>

      <div className="space-y-[18px]">
        <TrendingOnSui />
        <FeaturedPredict />
        <WhoToFollow />

        <p className="px-1 font-mono text-[11px] leading-[1.9] text-ink-faint">
          Terms · Privacy · Docs · Status<br />ReeF © 2026 · walletless · gasless · on Sui
        </p>
      </div>
    </div>
  );
}

/** Live token pairs from DeepBook, mid price + 24h-ish change feel. */
function TrendingOnSui() {
  const top = PAIRS.slice(0, 5);
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 pb-2.5 pt-4">
        <h3 className="text-[17px] font-black">Trending on Sui</h3>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#0a8a5b]">
          <span className="h-1.5 w-1.5 rounded-full bg-aqua" />live
        </span>
      </div>
      <div>
        {top.map((p) => (
          <MarketRow key={p.key} pairKey={p.key} base={p.base} quote={p.quote} />
        ))}
      </div>
    </Card>
  );
}

function MarketRow({ pairKey, base, quote }: { pairKey: string; base: string; quote: string }) {
  const db = useDeepBook();
  const book = useQuery({ queryKey: ["mid", pairKey], queryFn: () => deepbook.getMidPrice(db, pairKey), refetchInterval: 15000 });
  return (
    <Link href="/trade" className="flex items-center gap-3 px-5 py-[11px] transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_5%,transparent)]">
      <PairIcons base={base} quote={quote} size={30} />
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold">
          {base} <span className="text-ink-faint">/</span> {quote}
        </div>
        <div className="font-mono text-[11.5px] text-ink-faint">DeepBook v3</div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[13px] font-bold tabular-nums">{book.data != null ? fmtPrice(book.data) : "…"}</div>
        <div className="font-mono text-[11.5px] text-[#0a8a5b]">gasless</div>
      </div>
    </Link>
  );
}

/** Dark featured BTC prediction card — the design's standout element. */
function FeaturedPredict() {
  const featured = useQuery({
    queryKey: ["featured-predict"],
    refetchInterval: 30000,
    queryFn: async () => {
      const list = await listMarkets(10);
      if (!list.length) return null;
      const enriched = await Promise.all(
        list.map(async (m) => {
          const [trades, state] = await Promise.all([
            getOracleTrades(m.oracle_id, 50).catch(() => []),
            getOracleState(m.oracle_id).catch(() => null),
          ]);
          const volume = trades.reduce((s, t) => s + t.quantity, 0);
          const lp = state?.latest_price;
          const fwd = lp ? toUsd(lp.forward || lp.spot) : 0;
          return { ...m, volume, fwd };
        }),
      );
      enriched.sort((a, b) => b.volume - a.volume);
      const top = enriched[0];
      if (!top || top.fwd <= 0) return top ? { ...top, strike: 0, yes: 50 } : null;
      const strike = Math.round(top.fwd / 1000) * 1000;
      const yes = Math.round(impliedUpProb(top.fwd, strike, top.expiry - Date.now()) * 100);
      return { ...top, strike, yes };
    },
  });

  const m = featured.data;
  if (!m) return null;
  const day = new Date(m.expiry).toLocaleDateString(undefined, { weekday: "short" });
  const title = m.strike > 0 ? `BTC > ${usd0(m.strike)} by ${day}?` : "BTC binary — live market";

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-ink p-5 text-on-ink">
      <div className="pointer-events-none absolute -right-10 -top-10 h-[150px] w-[150px] rounded-full" style={{ background: "radial-gradient(circle,rgba(255,138,91,.4),transparent 70%)" }} />
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-coral">
        <CrosshairGlyph /> Predict · DeepBook
      </div>
      <h3 className="mb-1 mt-3 text-[19px] font-bold leading-[1.25]">{title}</h3>
      <div className="my-3.5 flex items-end gap-2">
        <span className="text-[40px] font-black leading-[0.9] text-mint">{m.yes}</span>
        <span className="mb-1.5 font-mono text-[13px] text-ink-faint">% YES</span>
      </div>
      <div className="h-[7px] overflow-hidden rounded-[10px] bg-[rgba(234,231,223,.16)]">
        <div className="h-full rounded-[10px]" style={{ width: `${m.yes}%`, background: "linear-gradient(90deg,#7CFCD8,#18C2C2)" }} />
      </div>
      <div className="mt-3.5 flex gap-2.5">
        <Link href={`/m/${m.oracle_id}`} className="flex-1 rounded-xl bg-aqua py-2.5 text-center text-[14px] font-bold text-[#04302f]">
          Buy YES · {(m.yes / 100).toFixed(2)}
        </Link>
        <Link href={`/m/${m.oracle_id}`} className="flex-1 rounded-xl bg-[rgba(234,231,223,.12)] py-2.5 text-center text-[14px] font-bold text-on-ink">
          Buy NO · {((100 - m.yes) / 100).toFixed(2)}
        </Link>
      </div>
    </div>
  );
}

function WhoToFollow() {
  const account = useSocialAccount();
  const people = useQuery({
    queryKey: ["suggested-profiles", account?.address],
    queryFn: () => trpc.suggestedProfiles.query({ viewer: account?.address, limit: 5 }),
  });
  const following = useQuery({
    queryKey: ["following", account?.address],
    queryFn: async () => (await trpc.following.query({ address: account!.address })).map((r) => r.followee),
    enabled: Boolean(account),
  });
  const followed = new Set(following.data ?? []);
  const list = (people.data ?? []).filter((p) => !followed.has(p.owner)).slice(0, 3);

  if (!list.length) return null;
  return (
    <Card className="px-5 py-4">
      <h3 className="mb-1.5 text-[17px] font-black">Who to follow</h3>
      <div>
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-[11px]">
            <Link href={`/u/${p.handle}`} className="shrink-0">
              <Avatar name={p.handle} src={p.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : null} size={40} />
            </Link>
            <Link href={`/u/${p.handle}`} className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-bold leading-tight hover:underline">{p.displayName || p.handle}</p>
              <p className="truncate font-mono text-[11.5px] text-ink-faint">@{p.handle}</p>
            </Link>
            <FollowButton target={p.owner} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function SearchGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function CrosshairGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </svg>
  );
}
