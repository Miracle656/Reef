"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { walrus, type Post } from "@umbra/core";
import { umbraConfig } from "@/lib/config";
import { trpc } from "@/lib/trpc";
import { shortAddr, timeAgo } from "@/lib/utils";
import { Avatar, Card } from "./ui";
import { LikeButton } from "./like-button";

export function PostCard({ post }: { post: Post }) {
  const author = useQuery({
    queryKey: ["profile-by-addr", post.author],
    queryFn: () => trpc.profileByAddress.query({ address: post.author }),
  });
  const a = author.data;

  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Avatar
          name={a?.handle ?? post.author}
          src={a?.avatarBlobId ? walrus.urlFor(umbraConfig, a.avatarBlobId) : null}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold">{a?.displayName ?? "Someone"}</span>
            <Link href={a ? `/u/${a.handle}` : "#"} className="text-ink-soft">
              @{a?.handle ?? shortAddr(post.author)}
            </Link>
            <span className="text-ink-faint">· {timeAgo(post.createdAtMs)}</span>
          </div>
          {post.text ? <p className="mt-1 whitespace-pre-wrap break-words text-[15px]">{post.text}</p> : null}
          {post.media.length > 0 ? (
            <div className={`mt-3 grid gap-2 ${post.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {post.media.map((blob) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={blob}
                  src={walrus.urlFor(umbraConfig, blob)}
                  alt=""
                  className="max-h-72 w-full rounded-md border-2 border-border-strong object-cover"
                />
              ))}
            </div>
          ) : null}
          <div className="mt-3">
            <LikeButton post={post} />
          </div>
        </div>
      </div>
    </Card>
  );
}
