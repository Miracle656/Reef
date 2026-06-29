"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SideRail, MobileNav } from "./side-rail";

function Sparkle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#0A84FF" aria-hidden>
      <path d="M12 2l1.9 5.2L19 9l-5.1 1.8L12 16l-1.9-5.2L5 9l5.1-1.8z" />
    </svg>
  );
}
function ArrowLeft() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

/**
 * App layout shell. The sidebar is in-flow (collapses to icons, expands on
 * hover) so it shares the row and never overlaps. The center is a glass card
 * with a sticky top bar; it scrolls internally. Right sidebar is optional.
 */
export function AppShell({
  children,
  right,
  title,
  subtitle,
  back,
  header,
  flush = false,
}: {
  children: ReactNode;
  right?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** href for the back arrow. */
  back?: string;
  /** extra sticky header row under the title (e.g. tabs). */
  header?: ReactNode;
  /** drop the default content padding (content manages its own). */
  flush?: boolean;
}) {
  return (
    <div className="mx-auto flex h-dvh max-w-[1320px] gap-6 px-3 py-4 md:px-6">
      <SideRail />
      <section
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-[color:var(--glass-border)] bg-surface-glass backdrop-blur-md"
      >
        {title !== undefined ? (
          <div className="sticky top-0 z-10 border-b border-[color:var(--glass-border)] bg-[color:color-mix(in_srgb,var(--surface)_82%,transparent)] backdrop-blur-xl">
            <div className="flex items-center gap-3.5 px-6 py-3.5">
              {back ? (
                <Link href={back} className="text-ink transition-opacity hover:opacity-60">
                  <ArrowLeft />
                </Link>
              ) : null}
              <div className="min-w-0 flex-1">
                <h1 className="text-[21px] font-black leading-tight tracking-tight">{title}</h1>
                {subtitle ? <div className="font-mono text-[11.5px] text-ink-faint">{subtitle}</div> : null}
              </div>
              <Sparkle />
            </div>
            {header}
          </div>
        ) : null}
        <div className={`min-h-0 flex-1 overflow-y-auto pb-24 md:pb-0 ${flush ? "" : "px-6 py-5"}`}>{children}</div>
      </section>
      {right ? <aside className="hidden w-[348px] shrink-0 overflow-y-auto pb-2 lg:block">{right}</aside> : null}
      <MobileNav />
    </div>
  );
}
