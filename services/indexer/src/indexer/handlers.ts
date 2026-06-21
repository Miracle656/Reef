/**
 * Event -> DB projection.
 *
 * `normalizeEvent` is pure (validates the on-chain `parsedJson` with the shared
 * Zod schemas) and unit-tested. `applyEvent` performs the Prisma upserts.
 */
import {
  FollowedEventSchema,
  PostCreatedEventSchema,
  PostDeletedEventSchema,
  PostEditedEventSchema,
  ProfileCreatedEventSchema,
  ProfileUpdatedEventSchema,
  UnfollowedEventSchema,
  type FollowedEvent,
  type PostCreatedEvent,
  type PostDeletedEvent,
  type PostEditedEvent,
  type ProfileCreatedEvent,
  type ProfileUpdatedEvent,
  type UnfollowedEvent,
} from "@umbra/core";
import type { PrismaClient } from "@prisma/client";

export type NormalizedEvent =
  | { type: "ProfileCreated"; data: ProfileCreatedEvent }
  | { type: "ProfileUpdated"; data: ProfileUpdatedEvent }
  | { type: "PostCreated"; data: PostCreatedEvent }
  | { type: "PostEdited"; data: PostEditedEvent }
  | { type: "PostDeleted"; data: PostDeletedEvent }
  | { type: "Followed"; data: FollowedEvent }
  | { type: "Unfollowed"; data: UnfollowedEvent };

/** Validate + tag a raw event by its short name; returns null if not ours. */
export function normalizeEvent(name: string, parsedJson: unknown): NormalizedEvent | null {
  switch (name) {
    case "ProfileCreated":
      return { type: name, data: ProfileCreatedEventSchema.parse(parsedJson) };
    case "ProfileUpdated":
      return { type: name, data: ProfileUpdatedEventSchema.parse(parsedJson) };
    case "PostCreated":
      return { type: name, data: PostCreatedEventSchema.parse(parsedJson) };
    case "PostEdited":
      return { type: name, data: PostEditedEventSchema.parse(parsedJson) };
    case "PostDeleted":
      return { type: name, data: PostDeletedEventSchema.parse(parsedJson) };
    case "Followed":
      return { type: name, data: FollowedEventSchema.parse(parsedJson) };
    case "Unfollowed":
      return { type: name, data: UnfollowedEventSchema.parse(parsedJson) };
    default:
      return null;
  }
}

export async function applyEvent(prisma: PrismaClient, ev: NormalizedEvent): Promise<void> {
  switch (ev.type) {
    case "ProfileCreated": {
      const d = ev.data;
      await prisma.profile.upsert({
        where: { id: d.profile_id },
        create: {
          id: d.profile_id,
          owner: d.owner,
          handle: d.handle,
          displayName: d.display_name,
          bio: d.bio,
          avatarBlobId: d.avatar_blob_id,
          suinsName: d.suins_name,
          createdAtMs: BigInt(d.created_at_ms),
          updatedAtMs: BigInt(d.created_at_ms),
        },
        update: {}, // creation is idempotent
      });
      return;
    }
    case "ProfileUpdated": {
      const d = ev.data;
      await prisma.profile.update({
        where: { id: d.profile_id },
        data: {
          handle: d.handle,
          displayName: d.display_name,
          bio: d.bio,
          avatarBlobId: d.avatar_blob_id,
          updatedAtMs: BigInt(d.updated_at_ms),
        },
      });
      return;
    }
    case "PostCreated": {
      const d = ev.data;
      await prisma.post.upsert({
        where: { id: d.post_id },
        create: {
          id: d.post_id,
          author: d.author,
          text: d.text,
          media: d.media,
          replyTo: d.reply_to,
          createdAtMs: BigInt(d.created_at_ms),
          updatedAtMs: BigInt(d.created_at_ms),
        },
        update: {},
      });
      return;
    }
    case "PostEdited": {
      const d = ev.data;
      await prisma.post.update({
        where: { id: d.post_id },
        data: { text: d.text, media: d.media, updatedAtMs: BigInt(d.updated_at_ms) },
      });
      return;
    }
    case "PostDeleted": {
      await prisma.post.update({ where: { id: ev.data.post_id }, data: { deleted: true } });
      return;
    }
    case "Followed": {
      const d = ev.data;
      await prisma.follow.upsert({
        where: { follower_followee: { follower: d.follower, followee: d.followee } },
        create: { follower: d.follower, followee: d.followee, createdAtMs: BigInt(d.created_at_ms) },
        update: {},
      });
      return;
    }
    case "Unfollowed": {
      const d = ev.data;
      await prisma.follow
        .delete({ where: { follower_followee: { follower: d.follower, followee: d.followee } } })
        .catch(() => undefined); // already gone -> ignore
      return;
    }
  }
}
