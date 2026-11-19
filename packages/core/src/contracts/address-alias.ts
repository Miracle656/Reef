/**
 * `0x2::address_alias` (#10): let extra keys (a recovery passkey, a guardian)
 * sign AS an existing address, so losing Google access doesn't lose the
 * account. The address never changes, so nothing migrates: Profile, posts,
 * FollowSet, Registry entries, SuiNS and chat groups all stay put.
 *
 * Validator rule (mirrored by {@link canSignFor}): an address with no
 * `AddressAliases` object can only be signed for by its own key. Once enabled,
 * ONLY the listed addresses may sign, so the zkLogin address must stay listed.
 *
 * Gotchas:
 * - `enable` must be its own transaction, before any `add` (it creates the
 *   `AddressAliases` object the other calls take).
 * - All four functions are `entry`: top-level PTB commands only, and their
 *   arguments can't be results of other calls. Each builder below is one tx.
 * - `remove` / `replace_all` refuse to empty the set; max 8 aliases.
 */
import { bcs } from "@mysten/sui/bcs";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { deriveObjectID, normalizeSuiAddress } from "@mysten/sui/utils";

/** The system `AddressAliasState` singleton. */
export const ADDRESS_ALIAS_STATE_ID = normalizeSuiAddress("0xa");
export const MAX_ADDRESS_ALIASES = 8;
const ALIAS_KEY_TYPE = "0x2::address_alias::AliasKey";

/** `AddressAliases` is a derived object of (0xa, AliasKey(owner)), so its id is
 *  a pure function of the owner: no index or lookup needed. */
export function addressAliasesId(owner: string): string {
  return deriveObjectID(ADDRESS_ALIAS_STATE_ID, ALIAS_KEY_TYPE, bcs.Address.serialize(normalizeSuiAddress(owner)).toBytes());
}

const AddressAliasesBcs = bcs.struct("AddressAliases", {
  id: bcs.Address,
  aliases: bcs.struct("VecSet", { contents: bcs.vector(bcs.Address) }),
});

export interface AliasState {
  owner: string;
  /** false = no AddressAliases object: only the owner's own key can sign */
  enabled: boolean;
  objectId: string;
  /** addresses allowed to sign as `owner` (just the owner when not enabled) */
  aliases: string[];
}

const NOT_FOUND = /not.?found|does not exist|deleted/i;

/** Read `owner`'s alias set the way validators do. */
export async function readAliasState(client: ClientWithCoreApi, owner: string): Promise<AliasState> {
  const normalized = normalizeSuiAddress(owner);
  const objectId = addressAliasesId(normalized);
  const { objects } = await client.core.getObjects({ objectIds: [objectId], include: { content: true } });
  const obj = objects[0];
  if (!obj || obj instanceof Error) {
    if (!obj || NOT_FOUND.test(obj.message)) return { owner: normalized, enabled: false, objectId, aliases: [normalized] };
    throw obj;
  }
  if (!obj.content) throw new Error(`AddressAliases ${objectId} returned no content`);
  const parsed = AddressAliasesBcs.parse(obj.content);
  return { owner: normalized, enabled: true, objectId, aliases: parsed.aliases.contents.map((a) => normalizeSuiAddress(a)) };
}

/** Whether `signer` may sign as `state.owner` under the validator's rule. */
export function canSignFor(state: AliasState, signer: string): boolean {
  const s = normalizeSuiAddress(signer);
  return state.enabled ? state.aliases.includes(s) : s === state.owner;
}

/** Tx 1 (once per address): create the sender's AddressAliases = {sender}. */
export function buildEnableAliasesTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: "0x2::address_alias::enable", arguments: [tx.object(ADDRESS_ALIAS_STATE_ID)] });
  return tx;
}

/** Add `alias` (e.g. a recovery passkey's address) to `owner`'s set. Sent by owner. */
export function buildAddAliasTx(owner: string, alias: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: "0x2::address_alias::add",
    arguments: [tx.object(addressAliasesId(owner)), tx.pure.address(normalizeSuiAddress(alias))],
  });
  return tx;
}

/** Remove `alias` from `owner`'s set (refuses to remove the last one). */
export function buildRemoveAliasTx(owner: string, alias: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: "0x2::address_alias::remove",
    arguments: [tx.object(addressAliasesId(owner)), tx.pure.address(normalizeSuiAddress(alias))],
  });
  return tx;
}

/** Rotate in one tx: add `next`, then remove `prev` (e.g. a lost passkey). */
export function buildRotateAliasTx(owner: string, prev: string, next: string): Transaction {
  const tx = new Transaction();
  const aliases = tx.object(addressAliasesId(owner));
  tx.moveCall({ target: "0x2::address_alias::add", arguments: [aliases, tx.pure.address(normalizeSuiAddress(next))] });
  tx.moveCall({ target: "0x2::address_alias::remove", arguments: [aliases, tx.pure.address(normalizeSuiAddress(prev))] });
  return tx;
}
