"use client";

/**
 * Internal metrics dashboard — NOT linked anywhere in the app.
 * For the team (and pitch decks): visit /stats directly.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Card, Spinner } from "@/components/ui";

const RANGES = [7, 30, 90] as const;

export default function StatsPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const stats = useQuery({
    queryKey: ["stats", days],
    queryFn: () => trpc.stats.query({ days }),
    refetchInterval: 60_000,
  });
  const s = stats.data;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">ReeF metrics</h1>
          <p className="mt-1 text-sm text-ink-soft">Live platform numbers from the indexer · internal only</p>
        </div>
        <div className="flex gap-1 rounded-full border border-[color:var(--glass-border)] bg-surface p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                days === r ? "bg-accent text-on-accent" : "text-ink-soft hover:bg-surface-muted"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {stats.isLoading ? (
        <div className="grid place-items-center py-24"><Spinner /></div>
      ) : !s ? (
        <p className="py-24 text-center text-sm text-ink-soft">Couldn&apos;t load stats.</p>
      ) : (
        <>
          {/* headline tiles */}
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile label="People on ReeF" value={s.totals.people} />
            <Tile label="Posts" value={s.totals.posts} />
            <Tile label="Comments" value={s.totals.comments} />
            <Tile label="Total interactions" value={s.totals.interactions} hint="likes + reposts + bookmarks + follows + comments" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile small label="Likes" value={s.totals.likes} />
            <Tile small label="Reposts" value={s.totals.reposts} />
            <Tile small label="Bookmarks" value={s.totals.bookmarks} />
            <Tile small label="Follows" value={s.totals.follows} />
          </div>

          {/* daily charts */}
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <BarChart title="New signups per day" days={s.days} pick={(d) => d.signups} />
            <BarChart title="Posts per day" days={s.days} pick={(d) => d.posts} />
            <BarChart title="Active users per day" days={s.days} pick={(d) => d.activeUsers} hint="people who posted, reacted or followed" />
            <BarChart title="Interactions per day" days={s.days} pick={(d) => d.interactions} hint="reactions + follows" />
          </div>

          {/* raw numbers for copy-paste */}
          <details className="mt-8">
            <summary className="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">Daily table</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--glass-border)] text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="py-2 pr-4 font-semibold">Day</th>
                    <th className="py-2 pr-4 font-semibold">Signups</th>
                    <th className="py-2 pr-4 font-semibold">Posts</th>
                    <th className="py-2 pr-4 font-semibold">Active users</th>
                    <th className="py-2 font-semibold">Interactions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.days].reverse().map((d) => (
                    <tr key={d.day} className="border-b border-[color:var(--glass-border)]">
                      <td className="py-1.5 pr-4 font-mono text-xs">{d.day}</td>
                      <td className="py-1.5 pr-4 tabular-nums">{d.signups}</td>
                      <td className="py-1.5 pr-4 tabular-nums">{d.posts}</td>
                      <td className="py-1.5 pr-4 tabular-nums">{d.activeUsers}</td>
                      <td className="py-1.5 tabular-nums">{d.interactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </main>
  );
}

function Tile({ label, value, hint, small = false }: { label: string; value: number; hint?: string; small?: boolean }) {
  return (
    <Card className={small ? "p-4" : "p-5"}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`${small ? "text-2xl" : "text-4xl"} mt-1 font-black tabular-nums tracking-tight`}>
        {value.toLocaleString()}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-ink-faint">{hint}</p> : null}
    </Card>
  );
}

type Day = { day: string; signups: number; posts: number; interactions: number; activeUsers: number };

/** Single-series daily bar chart: thin accent bars, rounded tops, hover tooltip. */
function BarChart({ title, days, pick, hint }: { title: string; days: Day[]; pick: (d: Day) => number; hint?: string }) {
  const max = Math.max(1, ...days.map(pick));
  const total = days.reduce((n, d) => n + pick(d), 0);
  const fmtDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs tabular-nums text-ink-faint">{total.toLocaleString()} in range</p>
      </div>
      {hint ? <p className="text-[11px] text-ink-faint">{hint}</p> : null}
      <div className="mt-3 flex h-36 items-end gap-[2px]">
        {days.map((d) => {
          const v = pick(d);
          return (
            <div key={d.day} className="group relative flex-1" style={{ height: "100%" }}>
              {/* full-height hit target so tiny bars are still hoverable */}
              <div className="absolute inset-0" />
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
                style={{ height: v === 0 ? 2 : `${Math.max(3, (v / max) * 100)}%`, opacity: v === 0 ? 0.15 : 1 }}
              />
              <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-white shadow group-hover:block">
                {fmtDay(d.day)} · {v.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-faint">
        <span>{fmtDay(days[0]!.day)}</span>
        <span>{fmtDay(days[days.length - 1]!.day)}</span>
      </div>
    </Card>
  );
}
