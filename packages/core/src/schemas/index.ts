/**
 * Zod schemas shared between `@umbra/core`, the indexer, and the apps.
 *
 * Two layers:
 *  - `*EventSchema` — the raw `parsedJson` shape emitted on-chain (Move u64 ->
 *    string, addresses/IDs -> "0x..", Option<String> -> string|null).
 *  - domain schemas (`Profile`, `Post`, ...) — camelCase, what the feed API returns.
 */
import { z } from "zod";

const SuiAddress = z.string().regex(/^0x[0-9a-fA-F]+$/, "expected 0x-prefixed hex");
const U64String = z.string().regex(/^\d+$/, "expected u64 as decimal string");

// ---- on-chain event payloads (parsedJson) ----------------------------------

export const ProfileCreatedEventSchema = z.object({
  profile_id: SuiAddress,
  owner: SuiAddress,
  handle: z.string(),
  display_name: z.string(),
  bio: z.string(),
  avatar_blob_id: z.string().nullable(),
  suins_name: z.string().nullable(),
  created_at_ms: U64String,
});

export const ProfileUpdatedEventSchema = z.object({
  profile_id: SuiAddress,
  owner: SuiAddress,
  handle: z.string(),
  display_name: z.string(),
  bio: z.string(),
  avatar_blob_id: z.string().nullable(),
  updated_at_ms: U64String,
});

export const PostCreatedEventSchema = z.object({
  post_id: SuiAddress,
  author: SuiAddress,
  text: z.string(),
  media: z.array(z.string()),
  reply_to: SuiAddress.nullable(),
  created_at_ms: U64String,
});

export const PostEditedEventSchema = z.object({
  post_id: SuiAddress,
  author: SuiAddress,
  text: z.string(),
  media: z.array(z.string()),
  updated_at_ms: U64String,
});

export const PostDeletedEventSchema = z.object({
  post_id: SuiAddress,
  author: SuiAddress,
});

export const FollowedEventSchema = z.object({
  follower: SuiAddress,
  followee: SuiAddress,
  created_at_ms: U64String,
});

export const UnfollowedEventSchema = z.object({
  follower: SuiAddress,
  followee: SuiAddress,
});

export type ProfileCreatedEvent = z.infer<typeof ProfileCreatedEventSchema>;
export type ProfileUpdatedEvent = z.infer<typeof ProfileUpdatedEventSchema>;
export type PostCreatedEvent = z.infer<typeof PostCreatedEventSchema>;
export type PostEditedEvent = z.infer<typeof PostEditedEventSchema>;
export type PostDeletedEvent = z.infer<typeof PostDeletedEventSchema>;
export type FollowedEvent = z.infer<typeof FollowedEventSchema>;
export type UnfollowedEvent = z.infer<typeof UnfollowedEventSchema>;

// ---- domain models (feed API responses) ------------------------------------

export const ProfileSchema = z.object({
  id: SuiAddress,
  owner: SuiAddress,
  handle: z.string(),
  displayName: z.string(),
  bio: z.string(),
  avatarBlobId: z.string().nullable(),
  suinsName: z.string().nullable(),
  createdAtMs: z.number().int(),
  updatedAtMs: z.number().int(),
  followersCount: z.number().int().nonnegative().default(0),
  followingCount: z.number().int().nonnegative().default(0),
});

export const PostSchema = z.object({
  id: SuiAddress,
  author: SuiAddress,
  text: z.string(),
  media: z.array(z.string()),
  replyTo: SuiAddress.nullable(),
  createdAtMs: z.number().int(),
  updatedAtMs: z.number().int(),
  deleted: z.boolean().default(false),
  likeCount: z.number().int().nonnegative().default(0),
  replyCount: z.number().int().nonnegative().default(0),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Post = z.infer<typeof PostSchema>;

// ---- off-chain signed reactions (verified + aggregated by the indexer) ------

export const ReactionKindSchema = z.enum(["like", "repost", "bookmark"]);

/** Payload the client signs (deterministic JSON) for an off-chain reaction. */
export const ReactionMessageSchema = z.object({
  kind: ReactionKindSchema,
  postId: SuiAddress,
  reactor: SuiAddress,
  /** unix ms; bounds replay and lets the indexer keep the latest intent */
  timestamp: z.number().int(),
  /** "1" to add, "0" to remove */
  value: z.union([z.literal(0), z.literal(1)]),
});

export const SignedReactionSchema = z.object({
  message: ReactionMessageSchema,
  /** base64 Sui personal-message signature over canonicalReactionBytes(message) */
  signature: z.string(),
});

export type ReactionMessage = z.infer<typeof ReactionMessageSchema>;
export type SignedReaction = z.infer<typeof SignedReactionSchema>;

/** Canonical bytes a client signs for a reaction (stable key order). */
export function canonicalReactionBytes(m: ReactionMessage): Uint8Array {
  const canonical = `umbra:reaction:${m.kind}:${m.postId}:${m.reactor}:${m.value}:${m.timestamp}`;
  return new TextEncoder().encode(canonical);
}

// ---- wallet linking (verified addresses, Farcaster-style) ------------------

/**
 * Bind an external (funded) wallet to a zkLogin social account. The EXTERNAL
 * wallet signs this, proving control of `linked` + intent to link it to `owner`
 * (the social/zkLogin address). The indexer verifies the signature.
 */
export const WalletLinkMessageSchema = z.object({
  /** zkLogin / social address the wallet is being linked to */
  owner: SuiAddress,
  /** external wallet being linked (the signer) */
  linked: SuiAddress,
  timestamp: z.number().int(),
});

export const SignedWalletLinkSchema = z.object({
  message: WalletLinkMessageSchema,
  /** base64 personal-message signature by `linked` over canonicalWalletLinkBytes */
  signature: z.string(),
});

export type WalletLinkMessage = z.infer<typeof WalletLinkMessageSchema>;
export type SignedWalletLink = z.infer<typeof SignedWalletLinkSchema>;

export function canonicalWalletLinkBytes(m: WalletLinkMessage): Uint8Array {
  return new TextEncoder().encode(`umbra:link:${m.owner}:${m.linked}:${m.timestamp}`);
}
