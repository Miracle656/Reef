import { describe, expect, it } from "vitest";
import { Inputs, Transaction } from "@mysten/sui/transactions";
import {
  addressAliasTargets,
  checkSelfSponsorable,
  frameworkCoinTargets,
  normalizeMoveTarget,
  SponsorPolicyError,
  umbraAllowedTargets,
  type SelfSponsorPolicy,
  type TransactionData,
} from "../server";

const PKG = "0x" + "a".repeat(64);
const SPONSOR = "0x" + "5".repeat(64);
const USER = "0x" + "1".repeat(64);
const OTHER = "0x" + "2".repeat(64);
const FOLLOW_SET = "0x" + "f".repeat(64);
const SPONSOR_COIN = "0x" + "c".repeat(64);
const DIGEST = "1".repeat(32); // base58 of 32 zero bytes

const validDuring = (min = "100", max = "101") => ({
  ValidDuring: { minEpoch: min, maxEpoch: max, minTimestamp: null, maxTimestamp: null, chain: "1".repeat(32), nonce: 7 },
});

/** A user follow, sponsored the self-run way: gas owner = sponsor, payment = []. */
function sponsoredFollow(edit?: (tx: Transaction) => void): Transaction {
  const tx = new Transaction();
  tx.setSender(USER);
  tx.setGasOwner(SPONSOR);
  tx.setGasPayment([]);
  tx.setGasBudget(10_000_000);
  tx.setGasPrice(1000);
  tx.setExpiration(validDuring());
  const set = tx.object(Inputs.ObjectRef({ objectId: FOLLOW_SET, version: "1", digest: DIGEST }));
  const clock = tx.object(Inputs.SharedObjectRef({ objectId: "0x6", initialSharedVersion: 1, mutable: false }));
  tx.moveCall({ target: `${PKG}::follow::follow`, arguments: [set, tx.pure.address(OTHER), clock] });
  edit?.(tx);
  return tx;
}

function policy(over: Partial<SelfSponsorPolicy> = {}): SelfSponsorPolicy {
  const owners: Record<string, string> = { [FOLLOW_SET]: USER, [SPONSOR_COIN]: SPONSOR };
  return {
    sponsorAddress: SPONSOR,
    allowedMoveCallTargets: [...umbraAllowedTargets(PKG), ...frameworkCoinTargets(), ...addressAliasTargets()],
    getAddressOwners: async (ids) => ids.map((id) => owners[id] ?? null),
    ...over,
  };
}

const check = (data: TransactionData, p = policy()) => checkSelfSponsorable(data, p);
const rejects = (data: TransactionData, msg: RegExp, p = policy()) =>
  expect(check(data, p)).rejects.toThrow(msg);

describe("self-run sponsor policy", () => {
  it("accepts a user's allow-listed call paid from the sponsor's address balance", async () => {
    await expect(check(sponsoredFollow().getData())).resolves.toBeUndefined();
  });

  it("matches short and full package ids (0x2 framework plumbing)", async () => {
    const tx = sponsoredFollow((t) => {
      const [coin] = t.splitCoins(t.object(Inputs.ObjectRef({ objectId: FOLLOW_SET, version: "1", digest: DIGEST })), [1]);
      t.moveCall({ target: "0x2::coin::send_funds", typeArguments: ["0x2::sui::SUI"], arguments: [coin, t.pure.address(USER)] });
    });
    await expect(check(tx.getData())).resolves.toBeUndefined();
    expect(normalizeMoveTarget("0x2::coin::join")).toBe(`0x${"0".repeat(63)}2::coin::join`);
  });

  it("rejects the sponsor as sender", () => rejects(sponsoredFollow((t) => t.setSender(SPONSOR)).getData(), /sender cannot be the sponsor/));

  it("rejects a gas owner other than the sponsor", () =>
    rejects(sponsoredFollow((t) => t.setGasOwner(OTHER)).getData(), /gas owner must be the sponsor/));

  it("rejects gas paid with coin objects instead of the address balance", () =>
    rejects(
      sponsoredFollow((t) => t.setGasPayment([{ objectId: SPONSOR_COIN, version: "1", digest: DIGEST }])).getData(),
      /address balance/,
    ));

  it("caps the gas budget (default 0.05 SUI, overridable)", async () => {
    await rejects(sponsoredFollow((t) => t.setGasBudget(50_000_001)).getData(), /over the 50000000 cap/);
    await rejects(sponsoredFollow().getData(), /over the 1000 cap/, policy({ maxGasBudget: 1000n }));
  });

  it("requires a short, bounded ValidDuring expiration", async () => {
    await rejects(sponsoredFollow((t) => t.setExpiration({ None: true })).getData(), /ValidDuring expiration/);
    await rejects(sponsoredFollow((t) => t.setExpiration(validDuring("100", "200"))).getData(), /too long/);
    const open = sponsoredFollow().getData();
    if (open.expiration?.$kind === "ValidDuring") open.expiration.ValidDuring.maxEpoch = null;
    await rejects(open, /bound both epochs/);
  });

  it("rejects move calls ReeF doesn't pay for", () =>
    rejects(
      sponsoredFollow((t) => t.moveCall({ target: `${"0x" + "9".repeat(64)}::evil::drain`, arguments: [] })).getData(),
      /call not sponsored: .*::evil::drain/,
    ));

  it("rejects publish/upgrade commands", async () => {
    const data = sponsoredFollow().getData();
    data.commands.push({ $kind: "Publish", Publish: { modules: [], dependencies: [] } } as never);
    await rejects(data, /command not sponsored: Publish/);
  });

  it("rejects the gas coin as an argument (it is the sponsor's balance)", () =>
    rejects(
      sponsoredFollow((t) => {
        const [c] = t.splitCoins(t.gas, [1_000_000_000]);
        t.transferObjects([c], USER);
      }).getData(),
      /gas coin/,
    ));

  it("rejects withdrawals from the sponsor's address balance", async () => {
    const data = sponsoredFollow().getData();
    data.inputs.push({
      $kind: "FundsWithdrawal",
      FundsWithdrawal: {
        reservation: { $kind: "MaxAmountU64", MaxAmountU64: "1000000000" },
        typeArg: { $kind: "Balance", Balance: "0x2::sui::SUI" },
        withdrawFrom: { $kind: "Sponsor", Sponsor: true },
      },
    } as never);
    await rejects(data, /only withdrawals from the sender/);
  });

  it("rejects transactions that touch a sponsor-owned object", () =>
    rejects(
      sponsoredFollow((t) => {
        t.transferObjects([t.object(Inputs.ObjectRef({ objectId: SPONSOR_COIN, version: "1", digest: DIGEST }))], USER);
      }).getData(),
      /sponsor-owned object/,
    ));

  it("throws a typed SponsorPolicyError", async () => {
    await expect(check(sponsoredFollow((t) => t.setSender(SPONSOR)).getData())).rejects.toBeInstanceOf(SponsorPolicyError);
  });
});
