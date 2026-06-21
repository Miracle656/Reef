import { describe, expect, it } from "vitest";
import { normalizeEvent } from "../indexer/handlers";

describe("normalizeEvent", () => {
  it("validates and tags a PostCreated event", () => {
    const ne = normalizeEvent("PostCreated", {
      post_id: "0xfeed",
      author: "0xabc",
      text: "gm",
      media: ["b1"],
      reply_to: null,
      created_at_ms: "1718900000000",
    });
    expect(ne?.type).toBe("PostCreated");
    if (ne?.type === "PostCreated") expect(ne.data.author).toBe("0xabc");
  });

  it("returns null for unknown event names", () => {
    expect(normalizeEvent("SomethingElse", {})).toBeNull();
  });

  it("throws on malformed payloads", () => {
    expect(() => normalizeEvent("Followed", { follower: "0x1" })).toThrow();
  });
});
