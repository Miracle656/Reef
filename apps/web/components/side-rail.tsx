"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { walrus } from "@umbra/core";
import { useSocialAccount } from "@/lib/account";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { ComposeModal } from "./compose-modal";
import { Avatar } from "./ui";

// ── icons ─────────────────────────────────────────────────────────────────────
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const cls = "h-[23px] w-[23px]";
export function HomeIcon({ className = cls }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" {...stroke}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
}
export function SearchIcon({ className = cls }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" {...stroke}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
}
export function MarketsIcon({ className = cls }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" {...stroke}><path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 4-6" /></svg>;
}
export function CrosshairIcon({ className = cls }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></svg>;
}
export function MessagesIcon({ className = cls }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" {...stroke}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>;
}
export function UserIcon({ className = cls }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
}
export function BellIcon({ className = cls }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" {...stroke}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
}
export function GearIcon({ className = cls }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}
export function PlusIcon({ className = cls }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}

type Item = { href: string; label: string; active: boolean; icon: ReactNode; badge?: number };

/** Unread = notifications newer than the last time the user opened /notifications
 *  (persisted per-address in localStorage by the notifications page). */
export function useUnreadNotifs(address?: string): number {
  const q = useQuery({
    queryKey: ["notifications", address],
    queryFn: () => trpc.notifications.query({ address: address!, limit: 30 }),
    enabled: Boolean(address),
    refetchInterval: 30_000,
  });
  if (!address || !q.data) return 0;
  const seen = Number((typeof localStorage !== "undefined" && localStorage.getItem(`reef:notif-seen:${address}`)) || 0);
  return q.data.filter((n) => n.createdAtMs > seen).length;
}

function useNav() {
  const account = useSocialAccount();
  const pathname = usePathname();
  const profile = useQuery({
    queryKey: ["profile-by-addr", account?.address],
    queryFn: () => trpc.profileByAddress.query({ address: account!.address }),
    enabled: Boolean(account),
  });
  const unread = useUnreadNotifs(account?.address);
  const profileHref = profile.data ? `/u/${profile.data.handle}` : "/onboarding";
  const items: Item[] = [
    { href: "/", label: "Home", active: pathname === "/", icon: <HomeIcon /> },
    { href: "/search", label: "Search", active: pathname.startsWith("/search"), icon: <SearchIcon /> },
    { href: "/trade", label: "Trade", active: pathname === "/trade" || pathname.startsWith("/m/"), icon: <MarketsIcon /> },
    { href: "/notifications", label: "Notifications", active: pathname.startsWith("/notifications"), icon: <BellIcon />, badge: unread },
    { href: "/messages", label: "Messages", active: pathname.startsWith("/messages"), icon: <MessagesIcon /> },
    { href: profileHref, label: "Profile", active: pathname.startsWith("/u/") || pathname === "/onboarding", icon: <UserIcon /> },
    { href: "/settings", label: "Settings", active: pathname.startsWith("/settings"), icon: <GearIcon /> },
  ];
  return { account, profile, profileHref, items };
}

/** Static, in-flow desktop sidebar (matches the redesign: it lives in the layout
 *  and pushes content — it never overlaps). Hidden on mobile (see MobileNav). */
export function SideRail() {
  const { account, profile, profileHref, items } = useNav();
  const [composeOpen, setComposeOpen] = useState(false);
  if (!account) return null;
  const avatarUrl = profile.data?.avatarBlobId ? walrus.urlFor(umbraConfig, profile.data.avatarBlobId) : null;

  return (
    <>
      {/* in-flow rail: collapsed to icons (74px), expands on hover (238px) and
          pushes the row — it never overlaps the feed. */}
      <aside className="group hidden w-[74px] shrink-0 flex-col gap-1.5 self-stretch overflow-hidden rounded-[22px] border border-[color:var(--glass-border)] bg-surface-glass p-3 shadow-[var(--shadow-glass)] backdrop-blur-xl transition-[width] duration-[440ms] ease-[cubic-bezier(.22,1,.36,1)] hover:w-[238px] md:flex">
        {/* brand */}
        <Link href="/" className="mb-1 flex items-center gap-3 rounded-2xl px-1.5 py-1.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-[18px] font-black text-on-ink">R</span>
          <span className="reef-lbl text-[24px] font-black tracking-tight">ReeF</span>
        </Link>

        <nav className="flex flex-col gap-1">
          {items.map((it) => (
            <RailItem key={it.label} {...it} />
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="lift mt-3 flex items-center gap-3.5 overflow-hidden rounded-2xl bg-accent px-3.5 py-3.5 font-bold text-on-accent shadow-[0_12px_26px_-12px_rgba(10,132,255,.8)]"
        >
          <PlusIcon className="h-[22px] w-[22px] shrink-0" />
          <span className="reef-lbl text-[16px]">Compose</span>
        </button>

        <Link href={profileHref} className="mt-auto flex items-center gap-3 overflow-hidden rounded-2xl border-t border-[color:var(--glass-border)] px-1.5 pb-1 pt-3 transition-colors hover:bg-surface-muted">
          <span className="shrink-0 overflow-hidden rounded-full ring-2 ring-[color:var(--border-strong)]">
            <Avatar name={profile.data?.handle ?? "you"} src={avatarUrl} size={36} />
          </span>
          <span className="reef-lbl flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[14.5px] font-bold text-ink">{profile.data?.displayName || profile.data?.handle || "Set up profile"}</span>
            <span className="truncate font-mono text-[11.5px] text-ink-faint">@{profile.data?.handle ?? "you"}</span>
          </span>
        </Link>
      </aside>
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </>
  );
}

function RailItem({ href, label, active, icon, badge }: Item) {
  return (
    <Link
      href={href}
      title={label}
      className={`flex items-center gap-4 overflow-hidden rounded-[14px] px-[13px] py-[11px] transition-colors ${
        active ? "bg-ink font-bold text-on-ink" : "font-medium text-ink-soft hover:bg-[color:color-mix(in_srgb,var(--ink)_6%,transparent)]"
      }`}
    >
      <span className="relative shrink-0">
        {icon}
        {badge ? (
          <span className="absolute -right-1.5 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-on-accent ring-2 ring-[color:var(--surface)]">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className="reef-lbl text-[16px]">{label}</span>
    </Link>
  );
}

/** Mobile bottom pill — the rail is hidden on small screens. */
export function MobileNav() {
  const { account, profileHref, items } = useNav();
  const [composeOpen, setComposeOpen] = useState(false);
  if (!account) return null;
  // Twitter-style bottom bar: Home · Search · Notifications · Messages.
  const pill = ["Home", "Search", "Notifications", "Messages"]
    .map((l) => items.find((i) => i.label === l))
    .filter(Boolean) as Item[];

  return (
    <>
      <nav className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[color:var(--glass-border)] bg-surface-glass px-2 py-2 shadow-[var(--shadow-glass-lg)] backdrop-blur-xl md:hidden">
        {pill.slice(0, 2).map((it) => (
          <MobilePill key={it.label} {...it} />
        ))}
        <button
          type="button"
          aria-label="New post"
          onClick={() => setComposeOpen(true)}
          className="lift mx-1 grid h-11 w-11 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-glass)]"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
        {pill.slice(2).map((it) => (
          <MobilePill key={it.label} {...it} />
        ))}
      </nav>
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
      <span className="sr-only">{profileHref}</span>
    </>
  );
}

function MobilePill({ href, label, active, icon, badge }: Item) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-colors ${
        active ? "bg-ink text-on-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      <span className="relative [&>svg]:h-5 [&>svg]:w-5">
        {icon}
        {badge ? <span className="absolute -right-1.5 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-on-accent">{badge > 9 ? "9+" : badge}</span> : null}
      </span>
      <span>{label}</span>
    </Link>
  );
}
