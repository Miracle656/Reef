"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { walrus } from "@umbra/core";
import { useSocialAccount } from "@/lib/account";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { ComposeModal } from "./compose-modal";
import { Avatar } from "./ui";

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}
function MarketsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l3-4 3 3 4-6" />
    </svg>
  );
}
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function CrosshairIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </svg>
  );
}
function MessagesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

type Item = { href: string; label: string; active: boolean; icon: React.ReactNode };

export function BottomNav() {
  const account = useSocialAccount();
  const pathname = usePathname();
  const [composeOpen, setComposeOpen] = useState(false);
  const profile = useQuery({
    queryKey: ["profile-by-addr", account?.address],
    queryFn: () => trpc.profileByAddress.query({ address: account!.address }),
    enabled: Boolean(account),
  });

  if (!account) return null;

  const profileHref = profile.data ? `/u/${profile.data.handle}` : "/onboarding";
  const avatarUrl = profile.data?.avatarBlobId ? walrus.urlFor(umbraConfig, profile.data.avatarBlobId) : null;

  const items: Item[] = [
    { href: "/", label: "Home", active: pathname === "/", icon: <HomeIcon className="h-[22px] w-[22px]" /> },
    { href: "/search", label: "Search", active: pathname.startsWith("/search"), icon: <SearchIcon className="h-[22px] w-[22px]" /> },
    { href: "/trade", label: "Trade", active: pathname.startsWith("/trade"), icon: <MarketsIcon className="h-[22px] w-[22px]" /> },
    { href: "/trade", label: "Predict", active: pathname.startsWith("/m/"), icon: <CrosshairIcon className="h-[22px] w-[22px]" /> },
    { href: "/messages", label: "Messages", active: pathname.startsWith("/messages"), icon: <MessagesIcon className="h-[22px] w-[22px]" /> },
    { href: profileHref, label: "Profile", active: pathname.startsWith("/u/") || pathname === "/onboarding", icon: <UserIcon className="h-[22px] w-[22px]" /> },
  ];

  return (
    <>
      {/* Desktop: full-height glass rail, anchored to the centered 1200px app unit. Expands on hover. */}
      <nav className="group fixed bottom-4 top-4 z-20 hidden w-[74px] flex-col rounded-[22px] border border-[color:var(--glass-border)] bg-surface-glass p-3 shadow-[var(--shadow-glass-lg)] backdrop-blur-xl transition-[width] duration-[440ms] ease-[cubic-bezier(.22,1,.36,1)] hover:w-[238px] md:flex left-[max(1rem,calc((100vw-1200px)/2))]">
        {/* brand */}
        <Link href="/" className="mb-3 flex items-center gap-3 overflow-hidden rounded-2xl px-1.5 py-1.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-[18px] font-black text-on-ink">R</span>
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-[22px] font-black tracking-tight opacity-0 transition-all duration-300 group-hover:max-w-[8rem] group-hover:opacity-100">ReeF</span>
        </Link>

        {/* primary nav */}
        <div className="flex flex-col gap-1">
          {items.map((it) => (
            <RailTab key={it.label} {...it} />
          ))}
        </div>

        {/* compose */}
        <button
          type="button"
          aria-label="New post"
          onClick={() => setComposeOpen(true)}
          className="lift mt-3 flex items-center gap-3 overflow-hidden rounded-2xl bg-accent px-3 py-3 text-on-accent shadow-[0_12px_26px_-12px_rgba(10,132,255,.8)]"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center">
            <PlusIcon className="h-[22px] w-[22px]" />
          </span>
          <span className="max-w-0 overflow-hidden whitespace-nowrap text-[16px] font-bold opacity-0 transition-all duration-300 group-hover:max-w-[8rem] group-hover:opacity-100">
            Compose
          </span>
        </button>

        {/* profile chip */}
        <div className="mt-auto border-t border-[color:var(--glass-border)] pt-2">
          <Link
            href={profileHref}
            className="flex items-center justify-center gap-3 overflow-hidden rounded-2xl px-2 py-2 transition-colors hover:bg-surface-muted group-hover:justify-start"
          >
            <span className="shrink-0 overflow-hidden rounded-full ring-2 ring-[color:var(--border-strong)]">
              <Avatar name={profile.data?.handle ?? "you"} src={avatarUrl} size={36} />
            </span>
            <span className="flex max-w-0 flex-col overflow-hidden whitespace-nowrap leading-tight opacity-0 transition-all duration-300 group-hover:max-w-[8rem] group-hover:opacity-100">
              <span className="text-[14.5px] font-bold text-ink">{profile.data?.displayName || profile.data?.handle || "Set up profile"}</span>
              <span className="font-mono text-[11.5px] text-ink-faint">@{profile.data?.handle ?? "you"}</span>
            </span>
          </Link>
        </div>
      </nav>

      {/* Mobile: bottom-center floating pill (curated: Home · Search · + · Messages · Profile) */}
      <nav className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[color:var(--glass-border)] bg-surface-glass px-2 py-2 shadow-[var(--shadow-glass-lg)] backdrop-blur-xl md:hidden">
        {[items[0], items[1]].map((it) => it && <PillTab key={it.label} {...it} />)}
        <button
          type="button"
          aria-label="New post"
          onClick={() => setComposeOpen(true)}
          className="lift mx-1 grid h-11 w-11 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-glass)]"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
        {[items[4], items[5]].map((it) => it && <PillTab key={it.label} {...it} />)}
      </nav>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </>
  );
}

/** Vertical rail tab: icon always; label slides in on rail hover. */
function RailTab({ href, label, active, icon }: Item) {
  return (
    <Link
      href={href}
      title={label}
      className={`flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors ${
        active ? "bg-ink text-on-ink" : "text-ink-soft hover:bg-surface-muted hover:text-ink"
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center">{icon}</span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-300 group-hover:max-w-[7rem] group-hover:opacity-100">
        {label}
      </span>
    </Link>
  );
}

/** Compact pill tab for the mobile bar (icon + tiny label). */
function PillTab({ href, label, active, icon }: Item) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-colors ${
        active ? "bg-ink text-on-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
