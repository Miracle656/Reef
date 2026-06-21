import { Transaction } from "@mysten/sui/transactions";
import type { UmbraConfig } from "../config";
import { addCreateFollowSet } from "./follow";
import { addCreateProfile, type CreateProfileInput } from "./profile";

/**
 * Single onboarding PTB: create the profile AND the follow set in one sponsored
 * transaction. The SuiNS leaf-subname is minted separately by the backend (it
 * owns the parent name) and passed in as `suinsName`.
 */
export function buildOnboardTx(cfg: UmbraConfig, p: CreateProfileInput): Transaction {
  const tx = new Transaction();
  addCreateProfile(tx, cfg, p);
  addCreateFollowSet(tx, cfg);
  return tx;
}
