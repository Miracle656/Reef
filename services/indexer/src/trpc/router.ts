import { z } from "zod";
import {
  SignedReactionSchema,
  SignedStatusDeleteSchema,
  SignedStatusSchema,
  SignedWalletLinkSchema,
  type Post,
  type Profile,
} from "@umbra/core";
import type { Post as PostRow, Profile as ProfileRow } from "@prisma/client";
import { applyReaction } from "../reactions";
import { applyStatus, applyStatusDelete, STATUS_TTL_MS } from "../status";
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

  // --- home feed: reverse-chron. "all" is the global firehose (For-you tab);
  // "following" gates to followed accounts + self. Defaults to "following" so
  // clients that don't send a scope keep their old behavior. ---
  feed: publicProcedure
    .input(
      z.object({
        address: SuiAddress,
        limit: z.number().int().min(1).max(100).default(30),
        beforeMs: z.number().int().optional(),
        scope: z.enum(["all", "following"]).default("following"),
      }),
    )
    .query(async ({ ctx, input }) => {
      let authorFilter: { author?: { in: string[] } } = {};
      if (input.scope === "following") {
        const follows = await ctx.prisma.follow.findMany({ where: { follower: input.address }, select: { followee: true } });
        // include the user's own posts alongside the accounts they follow
        authorFilter = { author: { in: [...new Set([...follows.map((f) => f.followee), input.address])] } };
      }
      const rows = await ctx.prisma.post.findMany({
        where: {
          ...authorFilter,
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
        select: { id: true, text: true, replyTo: true },
      });
      const myPostIds = myPosts.map((p) => p.id);
      const postText = new Map(myPosts.map((p) => [p.id, p.text]));
      // Whether the acted-on post was itself a comment — clients word the
      // notification "liked your comment" vs "liked your post" off this.
      const isReply = new Map(myPosts.map((p) => [p.id, p.replyTo != null]));
      // My handle — posts containing "@<handle>" are mentions of me.
      const meProfile = await ctx.prisma.profile.findUnique({ where: { owner: me }, select: { handle: true } });

      const [follows, replies, reactions, mentionRows] = await Promise.all([
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
        meProfile
          ? ctx.prisma.post.findMany({
              where: {
                deleted: false,
                author: { not: me },
                text: { contains: `@${meProfile.handle}`, mode: "insensitive" },
              },
              orderBy: { createdAtMs: "desc" },
              take: input.limit,
            })
          : Promise.resolve([]),
      ]);

      // Word-boundary check (so @alice doesn't match @alice2) + skip posts
      // that already notify as replies to me — no double notification.
      const replyIds = new Set(replies.map((r) => r.id));
      const mentionRe = meProfile ? new RegExp(`@${meProfile.handle}(?![a-z0-9_])`, "i") : null;
      const mentions = mentionRows.filter((p) => mentionRe?.test(p.text) && !replyIds.has(p.id));

      type NotifItem = {
        type: "follow" | "reply" | "like" | "repost" | "mention";
        actor: string;
        postId?: string;
        preview?: string;
        targetIsReply?: boolean;
        createdAtMs: number;
      };
      const items: NotifItem[] = [
        ...follows.map((f) => ({ type: "follow" as const, actor: f.follower, createdAtMs: Number(f.createdAtMs) })),
        ...replies.map((r) => ({
          type: "reply" as const,
          actor: r.author,
          postId: r.id,
          preview: r.text.slice(0, 140),
          targetIsReply: isReply.get(r.replyTo ?? "") ?? false,
          createdAtMs: Number(r.createdAtMs),
        })),
        ...reactions.map((r) => ({
          type: (r.kind === "repost" ? "repost" : "like") as "repost" | "like",
          actor: r.reactor,
          postId: r.postId,
          preview: postText.get(r.postId)?.slice(0, 140),
          targetIsReply: isReply.get(r.postId) ?? false,
          createdAtMs: Number(r.timestamp),
        })),
        ...mentions.map((p) => ({
          type: "mention" as const,
          actor: p.author,
          postId: p.id,
          preview: p.text.slice(0, 140),
          createdAtMs: Number(p.createdAtMs),
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

  // --- stories / status (24h ephemeral, signature-verified) ---
  statusPost: publicProcedure.input(SignedStatusSchema).mutation(async ({ ctx, input }) => {
    const id = await applyStatus(ctx.prisma, input);
    return { ok: id != null, id };
  }),

  statusDelete: publicProcedure.input(SignedStatusDeleteSchema).mutation(async ({ ctx, input }) => {
    const ok = await applyStatusDelete(ctx.prisma, input);
    return { ok };
  }),

  /** Live stories grouped per author, the viewer's own group first. */
  statusList: publicProcedure
    .input(z.object({ viewer: SuiAddress.optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.status.findMany({
        where: { createdAtMs: { gte: BigInt(Date.now() - STATUS_TTL_MS) } },
        orderBy: { createdAtMs: "asc" },
      });
      if (rows.length === 0) return [];
      const owners = [...new Set(rows.map((r) => r.owner))];
      const profiles = await ctx.prisma.profile.findMany({ where: { owner: { in: owners } } });
      const byOwner = new Map(profiles.map((p) => [p.owner, p]));
      const groups = owners.map((owner) => {
        const p = byOwner.get(owner);
        const items = rows
          .filter((r) => r.owner === owner)
          .map((r) => ({
            id: r.id,
            owner: r.owner,
            type: r.type as "text" | "image",
            content: r.content,
            mediaBlobId: r.mediaBlobId,
            bg: r.bg,
            createdAtMs: Number(r.createdAtMs),
            viewedBy: r.viewedBy,
          }));
        return {
          user: {
            address: owner,
            handle: p?.handle ?? null,
            displayName: p?.displayName ?? null,
            avatarBlobId: p?.avatarBlobId ?? null,
          },
          items,
          hasUnseen: input.viewer ? items.some((s) => !s.viewedBy.includes(input.viewer!)) : true,
        };
      });
      // viewer's own stories first, then most-recently-updated groups
      const last = (g: (typeof groups)[number]) => g.items[g.items.length - 1]?.createdAtMs ?? 0;
      return groups.sort((a, b) => {
        if (a.user.address === input.viewer) return -1;
        if (b.user.address === input.viewer) return 1;
        return last(b) - last(a);
      });
    }),

  /** Record that `viewer` saw a story (unauthenticated, same stakes as typing pings). */
  statusView: publicProcedure
    .input(z.object({ statusId: z.string().max(64), viewer: SuiAddress }))
    .mutation(async ({ ctx, input }) => {
      const s = await ctx.prisma.status.findUnique({ where: { id: input.statusId } });
      if (!s || s.viewedBy.includes(input.viewer)) return { ok: true };
      await ctx.prisma.status.update({
        where: { id: input.statusId },
        data: { viewedBy: { push: input.viewer } },
      });
      return { ok: true };
    }),

  // --- platform stats (dev/pitch dashboard, not user-facing) ---
  // Totals + a daily time series. Volumes are small in this phase, so the
  // series is aggregated in JS off the raw timestamps in the window.
  stats: publicProcedure
    .input(z.object({ days: z.number().int().min(7).max(90).default(30) }).default({ days: 30 }))
    .query(async ({ ctx, input }) => {
      const sinceMs = Date.now() - input.days * 86_400_000;
      const since = BigInt(sinceMs);

      const [
        people,
        posts,
        comments,
        follows,
        likes,
        reposts,
        bookmarks,
        newProfiles,
        newPosts,
        newReactions,
        newFollows,
      ] = await Promise.all([
        ctx.prisma.profile.count(),
        ctx.prisma.post.count({ where: { deleted: false, replyTo: null } }),
        ctx.prisma.post.count({ where: { deleted: false, replyTo: { not: null } } }),
        ctx.prisma.follow.count(),
        ctx.prisma.reaction.count({ where: { kind: "like", value: 1 } }),
        ctx.prisma.reaction.count({ where: { kind: "repost", value: 1 } }),
        ctx.prisma.reaction.count({ where: { kind: "bookmark", value: 1 } }),
        ctx.prisma.profile.findMany({ where: { createdAtMs: { gte: since } }, select: { createdAtMs: true } }),
        ctx.prisma.post.findMany({
          where: { deleted: false, createdAtMs: { gte: since } },
          select: { createdAtMs: true, author: true },
        }),
        ctx.prisma.reaction.findMany({
          where: { timestamp: { gte: sinceMs } },
          select: { timestamp: true, reactor: true },
        }),
        ctx.prisma.follow.findMany({
          where: { createdAtMs: { gte: since } },
          select: { createdAtMs: true, follower: true },
        }),
      ]);

      // day key = UTC date string
      const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const days: { day: string; signups: number; posts: number; interactions: number; activeUsers: number }[] = [];
      const index = new Map<string, number>();
      for (let i = input.days - 1; i >= 0; i--) {
        const day = dayOf(Date.now() - i * 86_400_000);
        index.set(day, days.length);
        days.push({ day, signups: 0, posts: 0, interactions: 0, activeUsers: 0 });
      }
      const activeByDay = new Map<string, Set<string>>();
      const touch = (ms: number, who?: string) => {
        const day = dayOf(ms);
        if (who) {
          let set = activeByDay.get(day);
          if (!set) activeByDay.set(day, (set = new Set()));
          set.add(who);
        }
        return index.get(day);
      };

      for (const p of newProfiles) {
        const i = touch(Number(p.createdAtMs));
        if (i != null) days[i]!.signups++;
      }
      for (const p of newPosts) {
        const i = touch(Number(p.createdAtMs), p.author);
        if (i != null) days[i]!.posts++;
      }
      for (const r of newReactions) {
        const i = touch(Number(r.timestamp), r.reactor);
        if (i != null) days[i]!.interactions++;
      }
      for (const f of newFollows) {
        const i = touch(Number(f.createdAtMs), f.follower);
        if (i != null) days[i]!.interactions++;
      }
      for (const [day, set] of activeByDay) {
        const i = index.get(day);
        if (i != null) days[i]!.activeUsers = set.size;
      }

      return {
        totals: { people, posts, comments, follows, likes, reposts, bookmarks, interactions: likes + reposts + bookmarks + follows + comments },
        days,
      };
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

  // --- messaging typing presence (ephemeral, in-memory) ---
  // "X is typing…" is a few-seconds-lived signal, so it never touches the DB or
  // the chain: clients ping while composing, peers poll. Entries expire after
  // TYPING_TTL_MS even if the "stopped" ping is lost (tab closed mid-keystroke).
  typingPing: publicProcedure
    .input(
      z.object({
        chatId: z.string().min(1).max(128),
        address: SuiAddress,
        name: z.string().max(64).default(""),
        typing: z.boolean(),
      }),
    )
    .mutation(({ input }) => {
      pruneTyping();
      if (!input.typing) {
        typingByChat.get(input.chatId)?.delete(input.address);
        return { ok: true };
      }
      let chat = typingByChat.get(input.chatId);
      if (!chat) {
        if (typingByChat.size >= TYPING_MAX_CHATS) return { ok: false };
        chat = new Map();
        typingByChat.set(input.chatId, chat);
      }
      if (!chat.has(input.address) && chat.size >= TYPING_MAX_PER_CHAT) return { ok: false };
      chat.set(input.address, { name: input.name, ts: Date.now() });
      return { ok: true };
    }),

  typingWho: publicProcedure
    .input(z.object({ chatIds: z.array(z.string().min(1).max(128)).max(50), exclude: SuiAddress.optional() }))
    .query(({ input }) => {
      pruneTyping();
      const out: Record<string, { address: string; name: string }[]> = {};
      for (const chatId of input.chatIds) {
        const chat = typingByChat.get(chatId);
        if (!chat?.size) continue;
        const users = [...chat.entries()]
          .filter(([addr]) => addr.toLowerCase() !== input.exclude?.toLowerCase())
          .map(([address, v]) => ({ address, name: v.name }));
        if (users.length) out[chatId] = users;
      }
      return out;
    }),

  // --- new-message pings (ephemeral, in-memory) ---
  // Powers the navbar's unread-messages badge OUTSIDE /messages, where the
  // (E2E-encrypted) relayer poll isn't running. Senders drop a content-free
  // ping per recipient — just "chat X has something new at time T". Same
  // privacy posture as typing presence: never the DB, never the chain.
  messagePing: publicProcedure
    .input(
      z.object({
        chatId: z.string().min(1).max(128),
        to: z.array(SuiAddress).min(1).max(50),
      }),
    )
    .mutation(({ input }) => {
      pruneMsgPings();
      const now = Date.now();
      for (const addr of input.to) {
        const key = addr.toLowerCase();
        let pings = msgPingsByUser.get(key);
        if (!pings) {
          if (msgPingsByUser.size >= MSG_PING_MAX_USERS) return { ok: false };
          pings = new Map();
          msgPingsByUser.set(key, pings);
        }
        if (!pings.has(input.chatId) && pings.size >= MSG_PING_MAX_PER_USER) continue;
        pings.set(input.chatId, now);
      }
      return { ok: true };
    }),

  /** Chats with something new for `address` — the client filters against its
   *  own "last time I looked at messages" watermark. */
  messagesSince: publicProcedure
    .input(z.object({ address: SuiAddress }))
    .query(({ input }) => {
      pruneMsgPings();
      const pings = msgPingsByUser.get(input.address.toLowerCase());
      if (!pings?.size) return [] as { chatId: string; at: number }[];
      return [...pings.entries()].map(([chatId, at]) => ({ chatId, at }));
    }),
});

const TYPING_TTL_MS = 6_000;
const TYPING_MAX_CHATS = 5_000;
const TYPING_MAX_PER_CHAT = 50;
const typingByChat = new Map<string, Map<string, { name: string; ts: number }>>();

function pruneTyping() {
  const cutoff = Date.now() - TYPING_TTL_MS;
  for (const [chatId, chat] of typingByChat) {
    for (const [addr, v] of chat) if (v.ts < cutoff) chat.delete(addr);
    if (!chat.size) typingByChat.delete(chatId);
  }
}

const MSG_PING_TTL_MS = 24 * 3_600_000;
const MSG_PING_MAX_USERS = 20_000;
const MSG_PING_MAX_PER_USER = 200;
/** recipient (lowercased) → chatId → last ping ms. In-memory: a restart just
 *  means a quiet badge until the next message — never lost messages. */
const msgPingsByUser = new Map<string, Map<string, number>>();

function pruneMsgPings() {
  const cutoff = Date.now() - MSG_PING_TTL_MS;
  for (const [addr, pings] of msgPingsByUser) {
    for (const [chatId, at] of pings) if (at < cutoff) pings.delete(chatId);
    if (!pings.size) msgPingsByUser.delete(addr);
  }
}

export type AppRouter = typeof appRouter;
