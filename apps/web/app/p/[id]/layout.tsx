import type { Metadata } from "next";

/**
 * Server wrapper for the (client) post page — supplies share metadata: link
 * previews get author + post text, and the sibling opengraph-image route
 * supplies the reef post card.
 */

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3001";

async function rpc<T>(proc: string, input: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${INDEXER_URL}/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`, {
      next: { revalidate: 300 },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: { data?: T | null } };
    return j.result?.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await rpc<{ author: string; text: string }>("post", { id });
  if (!post) return { title: "ReeF" };
  const author = await rpc<{ handle: string; displayName: string | null }>("profileByAddress", { address: post.author });
  const name = author?.displayName || author?.handle || "Someone";
  const snippet = post.text.trim().slice(0, 80) || "a post on the reef";
  const title = `${name} on ReeF: ${snippet}`;
  const description = post.text.trim().slice(0, 160) || "See the full post on ReeF — the social layer of Sui.";
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
