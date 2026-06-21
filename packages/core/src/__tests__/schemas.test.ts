import { describe, expect, it } from "vitest";
import {
  PostCreatedEventSchema,
  ProfileCreatedEventSchema,
  ReactionMessageSchema,
  canonicalReactionBytes,
} from "../schemas/index";

describe("event schemas", () => {
  it("parses a ProfileCreated parsedJson payload", () => {
    const parsed = ProfileCreatedEventSchema.parse({
      profile_id: "0x123",
      owner: "0xabc",
      handle: "alice",
      display_name: "Alice",
      bio: "gm",
      avatar_blob_id: "blobX",
      suins_name: "alice.umbra.sui",
      created_at_ms: "1718900000000",
    });
    expect(parsed.handle).toBe("alice");
    expect(parsed.suins_name).toBe("alice.umbra.sui");
  });

  it("accepts null Option fields and array media", () => {
    const parsed = PostCreatedEventSchema.parse({
      post_id: "0xfeed",
      author: "0xabc",
      text: "hi",
      media: ["b1", "b2"],
      reply_to: null,
      created_at_ms: "1718900000000",
    });
    expect(parsed.reply_to).toBeNull();
    expect(parsed.media).toHaveLength(2);
  });

  it("rejects a non-u64 timestamp string", () => {
    expect(() =>
      ProfileCreatedEventSchema.parse({
        profile_id: "0x1",
        owner: "0x2",
        handle: "x",
        display_name: "x",
        bio: "",
        avatar_blob_id: null,
        suins_name: null,
        created_at_ms: "not-a-number",
      }),
    ).toThrow();
  });
});

describe("reaction signing payload", () => {
  it("produces stable canonical bytes", () => {
    const msg = ReactionMessageSchema.parse({
      kind: "like",
      postId: "0xfeed",
      reactor: "0xabc",
      timestamp: 1718900000000,
      value: 1,
    });
    const bytes = canonicalReactionBytes(msg);
    expect(new TextDecoder().decode(bytes)).toBe("umbra:reaction:like:0xfeed:0xabc:1:1718900000000");
  });
});
