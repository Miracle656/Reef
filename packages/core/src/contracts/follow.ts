import { Transaction } from "@mysten/sui/transactions";
import type { UmbraConfig } from "../config";

/** Add `follow::create_follow_set` to a tx (composed into onboarding). */
export function addCreateFollowSet(tx: Transaction, cfg: UmbraConfig): Transaction {
  tx.moveCall({ target: `${cfg.packageId}::follow::create_follow_set` });
  return tx;
}

export function buildFollowTx(cfg: UmbraConfig, followSetId: string, followee: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${cfg.packageId}::follow::follow`,
    arguments: [tx.object(followSetId), tx.pure.address(followee), tx.object(cfg.clockId)],
  });
  return tx;
}

export function buildUnfollowTx(cfg: UmbraConfig, followSetId: string, followee: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${cfg.packageId}::follow::unfollow`,
    arguments: [tx.object(followSetId), tx.pure.address(followee)],
  });
  return tx;
}
