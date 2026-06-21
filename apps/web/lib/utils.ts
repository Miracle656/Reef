export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** 0x1234…abcd */
export function shortAddr(addr: string, lead = 6, tail = 4): string {
  return addr.length > lead + tail ? `${addr.slice(0, lead)}…${addr.slice(-tail)}` : addr;
}

export function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
