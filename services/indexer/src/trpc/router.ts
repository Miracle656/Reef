import { z } from "zod";
import { SignedReactionSchema, SignedWalletLinkSchema, type Post, type Profile } from "@umbra/core";
import type { Post as PostRow, Profile as ProfileRow } from "@prisma/client";
import { applyReaction } from "../reactions";
import { applyWalletLink } from "../links";
import { publicProcedure, router } from "./trpc";

const SuiAddress = z.string().regex(/^0x[0-9a-fA-F]+$/);

function toProfile(row: ProfileRow, followersCount = 0, followingCount = 0): Profile {
  return {
    id: row.id,
    owner: row.owner,
    handle: row.handle,
    displayName: row.displayName,
    bio: row.bio,
    avatarBlobId: row.avatarBlobId,
    suinsName: row.suinsName,
    createdAtMs: Number(row.createdAtMs),
    updatedAtMs: Number(row.updatedAtMs),
    followersCount,
    followingCount,
  };
}

function toPost(row: PostRow, likeCount = 0, replyCount = 0): Post {
  return {
    id: row.id,
    author: row.author,
    text: row.text,
    media: row.media,
    replyTo: row.replyTo,
    createdAtMs: Number(row.createdAtMs),
    updatedAtMs: Number(row.updatedAtMs),
    deleted: row.deleted,
    likeCount,
    replyCount,
  };
}

export const appRouter = router({
  // --- profile ---
  profileByHandle: publicProcedure.input(z.object({ handle: z.string() })).query(async ({ ctx, input }) => {
    const row = await ctx.prisma.profile.findUnique({ where: { handle: input.handle } });
    if (!row) return null;
    const [followersCount, followingCount] = await Promise.all([
      ctx.prisma.follow.count({ where: { followee: row.owner } }),
      ctx.prisma.follow.count({ where: { follower: row.owner } }),
    ]);
    return toProfile(row, followersCount, followingCount);
  }),

  profileByAddress: publicProcedure.input(z.object({ address: SuiAddress })).query(async ({ ctx, input }) => {
    const row = await ctx.prisma.profile.findUnique({ where: { owner: input.address } });
    if (!row) return null;
    const [followersCount, followingCount] = await Promise.all([
      ctx.prisma.follow.count({ where: { followee: row.owner } }),
      ctx.prisma.follow.count({ where: { follower: row.owner } }),
    ]);
    return toProfile(row, followersCount, followingCount);
  }),

  // --- suggested profiles to follow (most recent, excluding the viewer) ---
  suggestedProfiles: publicProcedure
    .input(z.object({ viewer: SuiAddress.optional(), limit: z.number().int().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.profile.findMany({
        where: input.viewer ? { owner: { not: input.viewer } } : {},
        orderBy: { createdAtMs: "desc" },
        take: input.limit + 3,
      });
      const out = await Promise.all(
        rows.slice(0, input.limit).map(async (r) => {
          const followersCount = await ctx.prisma.follow.count({ where: { followee: r.owner } });
          return toProfile(r, followersCount, 0);
        }),
      );
      return out;
    }),

  // --- search profiles by handle or display name ---
  searchProfiles: publicProcedure
    .input(z.object({ q: z.string().min(1).max(64), limit: z.number().int().min(1).max(20).default(12) }))
    .query(async ({ ctx, input }) => {
      const q = input.q.trim().replace(/^@/, "");
      if (!q) return [];
      const rows = await ctx.prisma.profile.findMany({
        where: {
          OR: [
            { handle: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { handle: "asc" },
        take: input.limit,
      });
      return rows.map((r) => toProfile(r));
    }),

  // --- single post ---
  post: publicProcedure.input(z.object({ id: SuiAddress })).query(async ({ ctx, input }) => {
    const row = await ctx.prisma.post.findUnique({ where: { id: input.id } });
    if (!row) return null;
    const [likeCount, replyCount] = await Promise.all([
      ctx.prisma.reaction.count({ where: { postId: row.id, kind: "like", value: 1 } }),
      ctx.prisma.post.count({ where: { replyTo: row.id, deleted: false } }),
    ]);
    return toPost(row, likeCount, replyCount);
  }),

  // --- home feed: reverse-chron posts from followed accounts ---
  feed: publicProcedure
    .input(z.object({ address: SuiAddress, limit: z.number().int().min(1).max(100).default(30), beforeMs: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      const follows = await ctx.prisma.follow.findMany({ where: { follower: input.address }, select: { followee: true } });
      // include the user's own posts alongside the accounts they follow
      const authors = [...new Set([...follows.map((f) => f.followee), input.address])];
      const rows = await ctx.prisma.post.findMany({
        where: {
          author: { in: authors },
          deleted: false,
          replyTo: null,
          ...(input.beforeMs ? { createdAtMs: { lt: BigInt(input.beforeMs) } } : {}),
        },
        orderBy: { createdAtMs: "desc" },
        take: input.limit,
      });
      return rows.map((r) => toPost(r));
    }),

  // --- posts by a single author (profile timeline) ---
  postsByAuthor: publicProcedure
    .input(z.object({ address: SuiAddress, limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.post.findMany({
        where: { author: input.address, deleted: false, replyTo: null },
        orderBy: { createdAtMs: "desc" },
        take: input.limit,
      });
      return rows.map((r) => toPost(r));
    }),

  // --- graph ---
  followers: publicProcedure.input(z.object({ address: SuiAddress })).query(({ ctx, input }) =>
    ctx.prisma.follow.findMany({ where: { followee: input.address }, select: { follower: true, createdAtMs: false } }),
  ),
  following: publicProcedure.input(z.object({ address: SuiAddress })).query(({ ctx, input }) =>
    ctx.prisma.follow.findMany({ where: { follower: input.address }, select: { followee: true } }),
  ),

  // --- reactions (off-chain, signature-verified) ---
  addReaction: publicProcedure.input(SignedReactionSchema).mutation(async ({ ctx, input }) => {
    const ok = await applyReaction(ctx.prisma, input);
    return { ok };
  }),
  reactionsForPost: publicProcedure.input(z.object({ postId: SuiAddress })).query(async ({ ctx, input }) => {
    const likes = await ctx.prisma.reaction.count({ where: { postId: input.postId, kind: "like", value: 1 } });
    const reposts = await ctx.prisma.reaction.count({ where: { postId: input.postId, kind: "repost", value: 1 } });
    return { likes, reposts };
  }),

  // like count + whether the viewer has liked (per-user, persisted on-chain-signed)
  likeState: publicProcedure
    .input(z.object({ postId: SuiAddress, viewer: SuiAddress.optional() }))
    .query(async ({ ctx, input }) => {
      const likes = await ctx.prisma.reaction.count({ where: { postId: input.postId, kind: "like", value: 1 } });
      let liked = false;
      if (input.viewer) {
        const r = await ctx.prisma.reaction.findUnique({
          where: { postId_reactor_kind: { postId: input.postId, reactor: input.viewer, kind: "like" } },
        });
        liked = r?.value === 1;
      }
      return { likes, liked };
    }),

  // --- replies (comments) to a post ---
  repliesForPost: publicProcedure
    .input(z.object({ postId: SuiAddress, limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.post.findMany({
        where: { replyTo: input.postId, deleted: false },
        orderBy: { createdAtMs: "asc" },
        take: input.limit,
      });
      return rows.map((r) => toPost(r));
    }),

  // --- posts a user reacted to with a given kind (repost / bookmark) ---
  reactedPosts: publicProcedure
    .input(z.object({ address: SuiAddress, kind: z.enum(["repost", "bookmark"]), limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const reactions = await ctx.prisma.reaction.findMany({
        where: { reactor: input.address, kind: input.kind, value: 1 },
        orderBy: { timestamp: "desc" },
        take: input.limit,
        select: { postId: true },
      });
      const ids = reactions.map((r) => r.postId);
      if (ids.length === 0) return [];
      const rows = await ctx.prisma.post.findMany({ where: { id: { in: ids }, deleted: false } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id)).filter((r): r is PostRow => Boolean(r)).map((r) => toPost(r));
    }),

  // --- combined per-post action state (like/repost/bookmark counts + viewer) ---
  postActions: publicProcedure
    .input(z.object({ postId: SuiAddress, viewer: SuiAddress.optional() }))
    .query(async ({ ctx, input }) => {
      const count = (kind: string) => ctx.prisma.reaction.count({ where: { postId: input.postId, kind, value: 1 } });
      const mine = (kind: string) =>
        input.viewer
          ? ctx.prisma.reaction
              .findUnique({ where: { postId_reactor_kind: { postId: input.postId, reactor: input.viewer, kind } } })
              .then((r) => r?.value === 1)
          : Promise.resolve(false);

      const [likes, reposts, bookmarks, liked, reposted, bookmarked, replyCount] = await Promise.all([
        count("like"),
        count("repost"),
        count("bookmark"),
        mine("like"),
        mine("repost"),
        mine("bookmark"),
        ctx.prisma.post.count({ where: { replyTo: input.postId, deleted: false } }),
      ]);
      return { likes, reposts, bookmarks, liked, reposted, bookmarked, replyCount };
    }),

  // --- notifications: who followed / replied to / liked the user, newest first ---
  notifications: publicProcedure
    .input(z.object({ address: SuiAddress, limit: z.number().int().min(1).max(50).default(30) }))
    .query(async ({ ctx, input }) => {
      const me = input.address;
      // My posts — replies + reactions target these.
      const myPosts = await ctx.prisma.post.findMany({
        where: { author: me, deleted: false },
        select: { id: true, text: true },
      });
      const myPostIds = myPosts.map((p) => p.id);
      const postText = new Map(myPosts.map((p) => [p.id, p.text]));

      const [follows, replies, reactions] = await Promise.all([
        ctx.prisma.follow.findMany({
          where: { followee: me, follower: { not: me } },
          orderBy: { createdAtMs: "desc" },
          take: input.limit,
        }),
        myPostIds.length
          ? ctx.prisma.post.findMany({
              where: { replyTo: { in: myPostIds }, deleted: false, author: { not: me } },
              orderBy: { createdAtMs: "desc" },
              take: input.limit,
            })
          : Promise.resolve([]),
        myPostIds.length
          ? ctx.prisma.reaction.findMany({
              where: { postId: { in: myPostIds }, value: 1, reactor: { not: me }, kind: { in: ["like", "repost"] } },
              orderBy: { timestamp: "desc" },
              take: input.limit,
            })
          : Promise.resolve([]),
      ]);

      type NotifItem = {
        type: "follow" | "reply" | "like" | "repost";
        actor: string;
        postId?: string;
        preview?: string;
        createdAtMs: number;
      };
      const items: NotifItem[] = [
        ...follows.map((f) => ({ type: "follow" as const, actor: f.follower, createdAtMs: Number(f.createdAtMs) })),
        ...replies.map((r) => ({
          type: "reply" as const,
          actor: r.author,
          postId: r.id,
          preview: r.text.slice(0, 140),
          createdAtMs: Number(r.createdAtMs),
        })),
        ...reactions.map((r) => ({
          type: (r.kind === "repost" ? "repost" : "like") as "repost" | "like",
          actor: r.reactor,
          postId: r.postId,
          preview: postText.get(r.postId)?.slice(0, 140),
          createdAtMs: Number(r.timestamp),
        })),
      ]
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, input.limit);

      // Resolve actor handles/avatars in one query.
      const actorAddrs = [...new Set(items.map((i) => i.actor))];
      const profiles = actorAddrs.length
        ? await ctx.prisma.profile.findMany({ where: { owner: { in: actorAddrs } } })
        : [];
      const byOwner = new Map(profiles.map((p) => [p.owner, p]));
      return items.map(({ actor, ...rest }) => {
        const p = byOwner.get(actor);
        return {
          ...rest,
          actor: {
            address: actor,
            handle: p?.handle ?? null,
            displayName: p?.displayName ?? null,
            avatarBlobId: p?.avatarBlobId ?? null,
          },
        };
      });
    }),

  // --- creator coins (tokenized content) ---
  creatorCoins: publicProcedure.input(z.object({ owner: SuiAddress })).query(async ({ ctx, input }) => {
    const rows = await ctx.prisma.creatorCoin.findMany({ where: { owner: input.owner }, orderBy: { createdAtMs: "desc" } });
    return rows.map((r) => ({
      coinType: r.coinType,
      owner: r.owner,
      symbol: r.symbol,
      name: r.name,
      poolId: r.poolId,
      postId: r.postId,
      createdAtMs: Number(r.createdAtMs),
    }));
  }),

  // --- wallet linking (verified external addresses) ---
  linkWallet: publicProcedure.input(SignedWalletLinkSchema).mutation(async ({ ctx, input }) => {
    const ok = await applyWalletLink(ctx.prisma, input);
    return { ok };
  }),
  linkedWallets: publicProcedure.input(z.object({ owner: SuiAddress })).query(async ({ ctx, input }) => {
    const rows = await ctx.prisma.linkedAddress.findMany({ where: { owner: input.owner }, orderBy: { createdAtMs: "asc" } });
    return rows.map((r) => r.linked);
  }),
  unlinkWallet: publicProcedure
    .input(z.object({ owner: SuiAddress, linked: SuiAddress }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.linkedAddress.deleteMany({ where: { owner: input.owner, linked: input.linked } });
      return { ok: true };
    }),
});

export type AppRouter = typeof appRouter;
