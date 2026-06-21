import { Transaction } from "@mysten/sui/transactions";
import type { UmbraConfig } from "../config";
import { serOptId, serString, serStringVec } from "./args";

export interface CreatePostInput {
  text: string;
  /** Walrus blob ids for attached media (<= 4) */
  media?: string[];
  /** parent post id if this is a reply */
  replyTo?: string | null;
}

export function buildCreatePostTx(cfg: UmbraConfig, p: CreatePostInput): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${cfg.packageId}::post::create_post`,
    arguments: [
      tx.pure(serString(p.text)),
      tx.pure(serStringVec(p.media ?? [])),
      tx.pure(serOptId(p.replyTo)),
      tx.object(cfg.clockId),
    ],
  });
  return tx;
}

export function buildEditPostTx(cfg: UmbraConfig, postId: string, text: string, media: string[] = []): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${cfg.packageId}::post::edit_post`,
    arguments: [
      tx.object(postId),
      tx.pure(serString(text)),
      tx.pure(serStringVec(media)),
      tx.object(cfg.clockId),
    ],
  });
  return tx;
}

export function buildDeletePostTx(cfg: UmbraConfig, postId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${cfg.packageId}::post::delete_post`,
    arguments: [tx.object(postId)],
  });
  return tx;
}
