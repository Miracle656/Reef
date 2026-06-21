import { describe, expect, it } from "vitest";
import type { Transaction } from "@mysten/sui/transactions";
import { testnetConfig } from "../config";
import { buildCreatePostTx, buildEditPostTx } from "../contracts/post";
import { buildFollowTx } from "../contracts/follow";
import { buildOnboardTx } from "../contracts/onboard";

const PKG = "0x" + "a".repeat(64);
const REG = "0x" + "b".repeat(64);
const cfg = testnetConfig(PKG, REG);

function moveCalls(tx: Transaction) {
  return tx.getData().commands.flatMap((c) => (c.$kind === "MoveCall" ? [c.MoveCall] : []));
}

describe("contract tx builders", () => {
  it("onboard composes create_profile + create_follow_set in one tx", () => {
    const tx = buildOnboardTx(cfg, {
      handle: "alice",
      displayName: "Alice",
      bio: "gm",
      avatarBlobId: "blob1",
      suinsName: "alice.umbra.sui",
    });
    const calls = moveCalls(tx);
    expect(calls.map((c) => `${c.module}::${c.function}`)).toEqual([
      "profile::create_profile",
      "follow::create_follow_set",
    ]);
    // create_profile: registry, handle, display, bio, avatar, suins, clock = 7 args
    expect(calls[0]!.arguments.length).toBe(7);
  });

  it("create_post has text, media, reply_to, clock", () => {
    const tx = buildCreatePostTx(cfg, { text: "hello", media: ["b1", "b2"], replyTo: null });
    const [call] = moveCalls(tx);
    expect(`${call!.module}::${call!.function}`).toBe("post::create_post");
    expect(call!.arguments.length).toBe(4);
  });

  it("edit_post targets the right function", () => {
    const tx = buildEditPostTx(cfg, "0x" + "c".repeat(64), "fixed", []);
    const [call] = moveCalls(tx);
    expect(call!.function).toBe("edit_post");
  });

  it("follow encodes the followee as an address arg", () => {
    const followee = "0x" + "d".repeat(64);
    const tx = buildFollowTx(cfg, "0x" + "e".repeat(64), followee);
    const [call] = moveCalls(tx);
    expect(call!.function).toBe("follow");
    expect(call!.arguments.length).toBe(3);
  });
});
