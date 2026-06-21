import { Transaction } from "@mysten/sui/transactions";
import type { UmbraConfig } from "../config";
import { serOptString, serString } from "./args";

export interface CreateProfileInput {
  handle: string;
  displayName: string;
  bio?: string;
  /** Walrus blob id of the avatar */
  avatarBlobId?: string | null;
  /** full SuiNS subname, e.g. "alice.umbra.sui" */
  suinsName?: string | null;
}

/** Add `profile::create_profile` to an existing tx (for composing onboarding). */
export function addCreateProfile(tx: Transaction, cfg: UmbraConfig, p: CreateProfileInput): Transaction {
  tx.moveCall({
    target: `${cfg.packageId}::profile::create_profile`,
    arguments: [
      tx.object(cfg.registryId),
      tx.pure(serString(p.handle)),
      tx.pure(serString(p.displayName)),
      tx.pure(serString(p.bio ?? "")),
      tx.pure(serOptString(p.avatarBlobId)),
      tx.pure(serOptString(p.suinsName)),
      tx.object(cfg.clockId),
    ],
  });
  return tx;
}

export function buildCreateProfileTx(cfg: UmbraConfig, p: CreateProfileInput): Transaction {
  return addCreateProfile(new Transaction(), cfg, p);
}

export interface UpdateProfileInput {
  profileId: string;
  displayName: string;
  bio?: string;
  avatarBlobId?: string | null;
}

export function buildUpdateProfileTx(cfg: UmbraConfig, p: UpdateProfileInput): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${cfg.packageId}::profile::update_profile`,
    arguments: [
      tx.object(p.profileId),
      tx.pure(serString(p.displayName)),
      tx.pure(serString(p.bio ?? "")),
      tx.pure(serOptString(p.avatarBlobId)),
      tx.object(cfg.clockId),
    ],
  });
  return tx;
}

export function buildChangeHandleTx(cfg: UmbraConfig, profileId: string, newHandle: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${cfg.packageId}::profile::change_handle`,
    arguments: [
      tx.object(cfg.registryId),
      tx.object(profileId),
      tx.pure(serString(newHandle)),
      tx.object(cfg.clockId),
    ],
  });
  return tx;
}
