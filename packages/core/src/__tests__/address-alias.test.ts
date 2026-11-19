import { describe, expect, it } from "vitest";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
  ADDRESS_ALIAS_STATE_ID,
  addressAliasesId,
  buildAddAliasTx,
  buildEnableAliasesTx,
  buildRemoveAliasTx,
  buildRotateAliasTx,
  canSignFor,
  type AliasState,
} from "../contracts/address-alias";

const OWNER = "0x" + "1".repeat(64);
const PASSKEY = "0x" + "2".repeat(64);
const OTHER = "0x" + "3".repeat(64);

const calls = (tx: ReturnType<typeof buildEnableAliasesTx>) =>
  tx.getData().commands.flatMap((c) => (c.$kind === "MoveCall" ? [`${c.MoveCall.module}::${c.MoveCall.function}`] : []));

describe("address_alias helpers", () => {
  it("derives a stable, per-owner AddressAliases id", () => {
    expect(addressAliasesId(OWNER)).toBe(addressAliasesId(OWNER.toUpperCase().replace("0X", "0x")));
    expect(addressAliasesId(OWNER)).not.toBe(addressAliasesId(PASSKEY));
    expect(addressAliasesId("0x1")).toBe(addressAliasesId(normalizeSuiAddress("0x1")));
    expect(ADDRESS_ALIAS_STATE_ID).toBe(normalizeSuiAddress("0xa"));
  });

  it("enable is a lone top-level call on the 0xa state object", () => {
    const tx = buildEnableAliasesTx();
    expect(calls(tx)).toEqual(["address_alias::enable"]);
    const input = tx.getData().inputs[0]!;
    expect(input.$kind === "UnresolvedObject" && input.UnresolvedObject.objectId).toBe(ADDRESS_ALIAS_STATE_ID);
  });

  it("add/remove target the owner's derived AddressAliases object", () => {
    for (const tx of [buildAddAliasTx(OWNER, PASSKEY), buildRemoveAliasTx(OWNER, PASSKEY)]) {
      const input = tx.getData().inputs[0]!;
      expect(input.$kind === "UnresolvedObject" && input.UnresolvedObject.objectId).toBe(addressAliasesId(OWNER));
    }
    expect(calls(buildAddAliasTx(OWNER, PASSKEY))).toEqual(["address_alias::add"]);
    expect(calls(buildRemoveAliasTx(OWNER, PASSKEY))).toEqual(["address_alias::remove"]);
  });

  it("rotation adds the new key before removing the old one (never empties the set)", () => {
    expect(calls(buildRotateAliasTx(OWNER, PASSKEY, OTHER))).toEqual(["address_alias::add", "address_alias::remove"]);
  });

  describe("canSignFor mirrors the validator", () => {
    const off: AliasState = { owner: OWNER, enabled: false, objectId: addressAliasesId(OWNER), aliases: [OWNER] };
    const on: AliasState = { ...off, enabled: true, aliases: [OWNER, PASSKEY] };

    it("not enabled: only the owner's own key", () => {
      expect(canSignFor(off, OWNER)).toBe(true);
      expect(canSignFor(off, PASSKEY)).toBe(false);
    });

    it("enabled: any listed key, including the recovery passkey", () => {
      expect(canSignFor(on, OWNER)).toBe(true);
      expect(canSignFor(on, PASSKEY)).toBe(true);
      expect(canSignFor(on, OTHER)).toBe(false);
    });

    it("enabled without the owner: the owner's own (rotated-out) key can no longer sign", () => {
      expect(canSignFor({ ...on, aliases: [PASSKEY] }, OWNER)).toBe(false);
    });
  });
});
