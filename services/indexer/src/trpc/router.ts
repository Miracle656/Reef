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
