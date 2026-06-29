"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { deepbook, walrus } from "@umbra/core";
import { AppShell } from "@/components/app-shell";
import { RightSidebar } from "@/components/right-sidebar";
import { Avatar } from "@/components/ui";
import { PairIcons } from "@/components/market-select";
import { FollowButton } from "@/components/follow-button";
import { PAIRS, useDeepBook } from "@/lib/deepbook";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";

type Filter = "all" | "people" | "pairs";
const fmtPrice = (p: number) => (p === 0 ? "—" : p < 1 ? p.toPrecision(4) : p.toLocaleString(undefined, { maximumFractionDigits: 2 }));

export default function SearchPage() {
  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 250);
    return () => clearTimeout(t);
  }, [raw]);

  const people = useQuery({
    queryKey: ["search-profiles", q],
    queryFn: () => trpc.searchProfiles.query({ q }),
    enabled: q.length >= 1,
  });

  const ql = q.toLowerCase();
  const pairs = q ? PAIRS.filter((p) => `${p.base} ${p.quote} ${p.key}`.toLowerCase().includes(ql)) : PAIRS;

  const showPeople = filter !== "pairs";
  const showPairs = filter !== "people";
  const peopleList = people.data ?? [];

  return (
    <AppShell flush title="Search" right={<RightSidebar />}>
      <div className="px-6 py-5">
        {/* search input */}
        <div className="flex items-center gap-3 rounded-full border border-[color:var(--border-strong)] bg-surface-glass px-[18px] py-3.5">
          <SearchGlyph className="h-[19px] w-[19px] text-accent" />
          <input
            autoFocus
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Search people, tokens or pairs…"
            className="w-full bg-transparent text-[15.5px] outline-none placeholder:text-ink-faint"
          />
          {raw ? (
            <button onClick={() => setRaw("")} className="text-ink-faint hover:text-ink" aria-label="Clear">✕</button>
          ) : null}
        </div>

        {/* filter chips */}
        <div className="mt-3.5 flex flex-wrap gap-2.5">
          {(["all", "people", "pairs"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-[14px] py-[7px] font-mono text-[12px] capitalize transition-colors ${
                filter === f ? "bg-ink text-on-ink" : "border border-[color:var(--border-strong)] text-ink-soft hover:text-ink"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* people */}
        {showPeople ? (
          <>
            <SectionLabel>People</SectionLabel>
            {q.length < 1 ? (
              <Hint>Search a handle or name to find people.</Hint>
            ) : people.isLoading ? (
              <Hint>Searching…</Hint>
            ) : !peopleList.length ? (
              <Hint>No people match “{q}”.</Hint>
            ) : (
              peopleList.map((p) => (
                <div key={p.id} className="flex items-center gap-3.5 rounded-2xl px-2 py-3 transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_4%,transparent)]">
                  <Link href={`/u/${p.handle}`} className="shrink-0">
                    <Avatar name={p.handle} src={p.avatarBlobId ? walrus.urlFor(umbraConfig, p.avatarBlobId) : null} size={46} />
                  </Link>
                  <Link href={`/u/${p.handle}`} className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold">{p.displayName || p.handle}</div>
                    <div className="truncate font-mono text-[12px] text-ink-faint">
                      @{p.handle}
                      {p.followersCount ? ` · ${p.followersCount} followers` : ""}
                    </div>
                  </Link>
                  <FollowButton target={p.owner} />
                </div>
              ))
            )}
          </>
        ) : null}

        {/* token pairs */}
        {showPairs ? (
          <>
            <SectionLabel>Token pairs</SectionLabel>
            {!pairs.length ? (
              <Hint>No pairs match “{q}”.</Hint>
            ) : (
              pairs.map((p) => <PairRow key={p.key} pairKey={p.key} base={p.base} quote={p.quote} />)
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function PairRow({ pairKey, base, quote }: { pairKey: string; base: string; quote: string }) {
  const db = useDeepBook();
  const mid = useQuery({ queryKey: ["mid", pairKey], queryFn: () => deepbook.getMidPrice(db, pairKey), refetchInterval: 20000 });
  return (
    <Link href="/trade" className="flex items-center gap-3.5 rounded-2xl px-2 py-3 transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_4%,transparent)]">
      <PairIcons base={base} quote={quote} size={42} />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold">
          {base} <span className="text-ink-faint">/</span> {quote}
        </div>
        <div className="font-mono text-[12px] text-ink-faint">DeepBook v3</div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[14px] font-bold tabular-nums">{mid.data != null ? fmtPrice(mid.data) : "…"}</div>
        <div className="font-mono text-[12px] text-[#0a8a5b]">gasless</div>
      </div>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 mt-6 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">{children}</div>;
}
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink-soft">{children}</p>;
}
function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}
