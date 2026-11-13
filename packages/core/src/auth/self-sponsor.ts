/**
 * SERVER-ONLY. Policy for the self-run sponsor (#11): ReeF pays gas from its
 * own sponsor key's **address balance** instead of going through Enoki.
 *
 * Flow (address-balance gas, no gas coins to pick):
 *   1. client sets gas owner = sponsor, gas payment = [] and builds the FULL tx
 *      (the SDK adds a short `ValidDuring` expiration, which is the replay guard)
 *   2. the user signs those final bytes
 *   3. the server runs {@link checkSelfSponsorable}, co-signs and executes
 *
 * A sponsor signs as a required signer, so anything the sponsor owns is
 * reachable from the transaction. This policy is what stops a user from
 * spending the sponsor's coins, withdrawing from its address balance, splitting
 * the gas coin, or calling anything ReeF doesn't pay for.
 */
import type { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";

/** Default cap per transaction: 0.05 SUI. */
export const SELF_SPONSOR_MAX_GAS_BUDGET = 50_000_000n;

/** Longest `ValidDuring` window accepted, in epochs (the SDK uses 1). */
const MAX_VALID_EPOCHS = 2n;

export type TransactionData = ReturnType<Transaction["getData"]>;

/**
 * Framework coin/balance plumbing that `coinWithBalance` and balance intents
 * emit (`redeem_funds`, `send_funds`, `destroy_zero`, …). Each only moves the
 * SENDER's own funds: withdrawals are checked to come from the sender, and the
 * sponsor's objects are rejected separately.
 */
export function frameworkCoinTargets(): string[] {
  return [
    "0x2::coin::split",
    "0x2::coin::join",
    "0x2::coin::zero",
    "0x2::coin::destroy_zero",
    "0x2::coin::into_balance",
    "0x2::coin::from_balance",
    "0x2::coin::redeem_funds",
    "0x2::coin::send_funds",
    "0x2::balance::split",
    "0x2::balance::join",
    "0x2::balance::zero",
    "0x2::balance::destroy_zero",
    "0x2::balance::redeem_funds",
    "0x2::balance::send_funds",
  ];
}

/** `0x2::address_alias` entry functions (passkey recovery, #10). */
export function addressAliasTargets(): string[] {
  return [
    "0x2::address_alias::enable",
    "0x2::address_alias::add",
    "0x2::address_alias::remove",
    "0x2::address_alias::replace_all",
  ];
}

/** Normalize `pkg::module::fn` so `0x2::…` and the 64-hex form compare equal. */
export function normalizeMoveTarget(target: string): string {
  const [pkg, mod, fn] = target.split("::");
  if (!pkg || !mod || !fn) throw new Error(`invalid move target: ${target}`);
  return `${normalizeSuiAddress(pkg)}::${mod}::${fn}`;
}

export class SponsorPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SponsorPolicyError";
  }
}

export interface SelfSponsorPolicy {
  sponsorAddress: string;
  /** `pkg::module::fn` targets ReeF pays for (short or full package ids) */
  allowedMoveCallTargets: Iterable<string>;
  /** per-transaction gas budget cap in MIST (default 0.05 SUI) */
  maxGasBudget?: bigint;
  /**
   * Owner lookup for the transaction's object inputs: the owning address for
   * address-owned objects, `null` for shared/immutable/missing ones.
   */
  getAddressOwners: (objectIds: string[]) => Promise<(string | null)[]>;
}

const ALLOWED_COMMANDS = new Set(["MoveCall", "TransferObjects", "SplitCoins", "MergeCoins", "MakeMoveVec"]);

/** True if any argument anywhere in the commands is the gas coin. With
 *  address-balance gas that coin is the SPONSOR's balance, so splitting or
 *  transferring it would drain the sponsor. */
function usesGasCoin(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(usesGasCoin);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.$kind === "GasCoin" || "GasCoin" in v) return true;
    return Object.values(v).some(usesGasCoin);
  }
  return false;
}

/**
 * Throws {@link SponsorPolicyError} unless the self-run sponsor should co-sign
 * `data`. Pure apart from the injected owner lookup, so it's unit-testable.
 */
export async function checkSelfSponsorable(data: TransactionData, policy: SelfSponsorPolicy): Promise<void> {
  const sponsor = normalizeSuiAddress(policy.sponsorAddress);
  const maxBudget = policy.maxGasBudget ?? SELF_SPONSOR_MAX_GAS_BUDGET;
  const allowed = new Set([...policy.allowedMoveCallTargets].map(normalizeMoveTarget));
  const fail = (msg: string): never => {
    throw new SponsorPolicyError(msg);
  };

  // --- who pays, how much, for how long ---
  if (!data.sender) fail("missing sender");
  if (normalizeSuiAddress(data.sender!) === sponsor) fail("sender cannot be the sponsor");
  if (!data.gasData.owner || normalizeSuiAddress(data.gasData.owner) !== sponsor) fail("gas owner must be the sponsor");
  if (!data.gasData.payment || data.gasData.payment.length !== 0) fail("gas must come from the sponsor's address balance (payment = [])");
  const budget = BigInt(data.gasData.budget ?? 0);
  if (budget <= 0n) fail("missing gas budget");
  if (budget > maxBudget) fail(`gas budget ${budget} is over the ${maxBudget} cap`);

  // The expiration is the replay guard for address-balance gas (there are no
  // gas-coin versions to consume), so require a short, bounded epoch window.
  const exp = data.expiration;
  const window = exp?.$kind === "ValidDuring" ? exp.ValidDuring : exp?.$kind === "Validity" ? exp.Validity : null;
  if (!window) fail("address-balance gas needs a ValidDuring expiration");
  if (window!.minEpoch == null || window!.maxEpoch == null) fail("ValidDuring must bound both epochs");
  if (BigInt(window!.maxEpoch!) - BigInt(window!.minEpoch!) > MAX_VALID_EPOCHS) fail("ValidDuring window is too long");

  // --- what it spends ---
  const objectIds: string[] = [];
  for (const input of data.inputs) {
    if (input.$kind === "FundsWithdrawal" && input.FundsWithdrawal.withdrawFrom.$kind !== "Sender") {
      fail("only withdrawals from the sender are sponsored");
    }
    if (input.$kind === "Object") {
      const o = input.Object;
      objectIds.push(
        o.$kind === "ImmOrOwnedObject"
          ? o.ImmOrOwnedObject.objectId
          : o.$kind === "SharedObject"
            ? o.SharedObject.objectId
            : o.Receiving.objectId,
      );
    }
    if (input.$kind === "UnresolvedObject" || input.$kind === "UnresolvedPure") fail("transaction is not fully built");
  }

  // --- what it does ---
  for (const cmd of data.commands) {
    if (!ALLOWED_COMMANDS.has(cmd.$kind)) fail(`command not sponsored: ${cmd.$kind}`);
    if (cmd.$kind === "MoveCall") {
      const t = `${normalizeSuiAddress(cmd.MoveCall.package)}::${cmd.MoveCall.module}::${cmd.MoveCall.function}`;
      if (!allowed.has(t)) fail(`call not sponsored: ${cmd.MoveCall.package}::${cmd.MoveCall.module}::${cmd.MoveCall.function}`);
    }
  }
  if (usesGasCoin(data.commands)) fail("the gas coin can't be used as an argument");

  // --- nothing the sponsor owns ---
  if (objectIds.length) {
    const owners = await policy.getAddressOwners(objectIds);
    if (owners.some((o) => o != null && normalizeSuiAddress(o) === sponsor)) {
      fail("transaction touches a sponsor-owned object");
    }
  }
}
