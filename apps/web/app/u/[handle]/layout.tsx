import type { Metadata } from "next";

/**
 * Server wrapper for the (client) profile page — its only job is the share
 * metadata: link previews get the person's name/bio as title/description,
 * and the sibling opengraph-image route supplies the reef card.
 */

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  try {
    const input = encodeURIComponent(JSON.stringify({ handle: handle.toLowerCase() }));
    const r = await fetch(`${INDEXER_URL}/trpc/profileByHandle?input=${input}`, { next: { revalidate: 300 } });
    const j = (await r.json()) as { result?: { data?: { handle: string; displayName: string | null; bio: string | null } | null } };
    const p = j.result?.data;
    if (!p) return { title: "ReeF" };
    const title = `${p.displayName || p.handle} (@${p.handle}.reef) · ReeF`;
    const description = p.bio || `@${p.handle}.reef on ReeF — the social layer of Sui.`;
    return {
      title,
      description,
      openGraph: { title, description, type: "profile" },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return { title: "ReeF" };
  }
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
