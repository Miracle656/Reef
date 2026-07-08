// DeepBook Predict — Move-call tx builders (binary mint flow).
//
// The deployed `predict::create_manager(ctx)` shares the manager internally and
// returns only its ID, so first-ever use is two signatures:
//   1. buildCreateManagerTx — creates + shares the PredictManager.
//   2. buildDepositMintTx    — funds (optional) + mints in one PTB.
// Later mints are a single signature.

import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { CLOCK_ID, DUSDC_TYPE, PLP_TYPE, PREDICT_OBJECT_ID, PREDICT_PKG } from "./predict";

/** Stand-alone tx that creates + shares a PredictManager owned by the sender. */
export function buildCreateManagerTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: `${PREDICT_PKG}::predict::create_manager`, arguments: [] });
  return tx;
}

export interface DepositMintParams {
  managerId: string;
  oracleId: string;
  /** Oracle expiry in ms (goes into the MarketKey). */
  expiry: number;
  /** Strike in 1e9-scaled u64 (aligned to the oracle tick grid). */
  strike: number;
  isUp: boolean;
  /** Size in dUSDC base units (1_000_000 = 1 contract = $1 max payout). */
  quantity: bigint;
  /** Extra dUSDC to deposit before minting. 0n to skip the deposit step. */
  depositAmount: bigint;
}

/** Compose deposit (optional) + mint in one PTB. Sender must own the manager. */
export function buildDepositMintTx(p: DepositMintParams): Transaction {
  const tx = new Transaction();
  const manager = tx.object(p.managerId);

  if (p.depositAmount > 0n) {
    const coin = tx.add(coinWithBalance({ balance: p.depositAmount, type: DUSDC_TYPE }));
    tx.moveCall({
      target: `${PREDICT_PKG}::predict_manager::deposit`,
      typeArguments: [DUSDC_TYPE],
      arguments: [manager, coin],
    });
  }

  const key = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::new`,
    arguments: [tx.pure.id(p.oracleId), tx.pure.u64(p.expiry), tx.pure.u64(p.strike), tx.pure.bool(p.isUp)],
  });

  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      manager,
      tx.object(p.oracleId),
      key,
      tx.pure.u64(p.quantity),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/** Stand-alone PTB: deposit dUSDC into an existing manager. */
export function buildDepositTx(managerId: string, amount: bigint): Transaction {
  const tx = new Transaction();
  const coin = tx.add(coinWithBalance({ balance: amount, type: DUSDC_TYPE }));
  tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::deposit`,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(managerId), coin],
  });
  return tx;
}

export interface RedeemParams {
  managerId: string;
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  /** Quantity to redeem in dUSDC base units (max = position open_quantity). */
  quantity: bigint;
}

/**
 * Redeem a binary position — payout flows back into the manager's dUSDC
 * balance. Works pre-expiry (sell) and post-settlement (claim).
 */
export function buildRedeemTx(p: RedeemParams): Transaction {
  const tx = new Transaction();
  const key = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::new`,
    arguments: [tx.pure.id(p.oracleId), tx.pure.u64(p.expiry), tx.pure.u64(p.strike), tx.pure.bool(p.isUp)],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::redeem`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(p.managerId),
      tx.object(p.oracleId),
      key,
      tx.pure.u64(p.quantity),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Withdraw dUSDC from the manager back to `sender`. `predict_manager::withdraw`
 * returns a Coin<dUSDC>, which we transfer to the caller's zkLogin address.
 */
export function buildWithdrawTx(managerId: string, amount: bigint, sender: string): Transaction {
  const tx = new Transaction();
  const coin = tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::withdraw`,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(managerId), tx.pure.u64(amount)],
  });
  tx.transferObjects([coin], tx.pure.address(sender));
  return tx;
}

/**
 * devInspect-only PTB reading per-unit (cost, payout) for a market key via
 * `predict::get_trade_amounts`. No sponsor / no allow-list. An out-of-band
 * strike aborts — treat that as "not quotable".
 */
export function buildPreviewTx(args: {
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity: bigint;
}): Transaction {
  const tx = new Transaction();
  const key = tx.moveCall({
    target: `${PREDICT_PKG}::market_key::new`,
    arguments: [tx.pure.id(args.oracleId), tx.pure.u64(args.expiry), tx.pure.u64(args.strike), tx.pure.bool(args.isUp)],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::get_trade_amounts`,
    arguments: [tx.object(PREDICT_OBJECT_ID), tx.object(args.oracleId), key, tx.pure.u64(args.quantity), tx.object(CLOCK_ID)],
  });
  return tx;
}

// ── LP vault (be the maker) ───────────────────────────────────────────────
// supply<Quote> mints PLP shares; withdraw<Quote> burns them. Both assert the
// vault MTM is fresh, so each is preceded by refresh_oracle_mtm for currently
// LIVE exposed oracles (caller supplies the filtered list).

function refreshExposedOracles(tx: Transaction, oracleIds: string[]) {
  for (const oid of oracleIds) {
    tx.moveCall({
      target: `${PREDICT_PKG}::predict::refresh_oracle_mtm`,
      arguments: [tx.object(PREDICT_OBJECT_ID), tx.object(oid), tx.object(CLOCK_ID)],
    });
  }
}

/** Supply dUSDC into the vault; minted PLP shares go to `sender`. */
export function buildSupplyTx(amount: bigint, sender: string, refreshOracleIds: string[] = []): Transaction {
  const tx = new Transaction();
  refreshExposedOracles(tx, refreshOracleIds);
  const coin = tx.add(coinWithBalance({ balance: amount, type: DUSDC_TYPE }));
  const plp = tx.moveCall({
    target: `${PREDICT_PKG}::predict::supply`,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(PREDICT_OBJECT_ID), coin, tx.object(CLOCK_ID)],
  });
  tx.transferObjects([plp], tx.pure.address(sender));
  return tx;
}

/** Burn `plpAmount` PLP shares and send the redeemed dUSDC to `sender`. */
export function buildWithdrawLpTx(plpAmount: bigint, sender: string, refreshOracleIds: string[] = []): Transaction {
  const tx = new Transaction();
  refreshExposedOracles(tx, refreshOracleIds);
  const lpCoin = tx.add(coinWithBalance({ balance: plpAmount, type: PLP_TYPE }));
  const out = tx.moveCall({
    target: `${PREDICT_PKG}::predict::withdraw`,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(PREDICT_OBJECT_ID), lpCoin, tx.object(CLOCK_ID)],
  });
  tx.transferObjects([out], tx.pure.address(sender));
  return tx;
}

// ── Range positions (vertical bands) ──────────────────────────────────────
// Pays $1·qty if settlement lands in the half-open band (lower, higher].

export interface RangeMintParams {
  managerId: string;
  oracleId: string;
  expiry: number;
  /** 1e9-scaled lower strike (aligned to the oracle tick grid). */
  lowerStrike: number;
  /** 1e9-scaled higher strike (> lower, aligned to grid). */
  higherStrike: number;
  quantity: bigint;
  depositAmount: bigint;
}

/** Compose deposit (optional) + mint_range in one PTB. */
export function buildDepositMintRangeTx(p: RangeMintParams): Transaction {
  const tx = new Transaction();
  const manager = tx.object(p.managerId);

  if (p.depositAmount > 0n) {
    const coin = tx.add(coinWithBalance({ balance: p.depositAmount, type: DUSDC_TYPE }));
    tx.moveCall({
      target: `${PREDICT_PKG}::predict_manager::deposit`,
      typeArguments: [DUSDC_TYPE],
      arguments: [manager, coin],
    });
  }

  const key = tx.moveCall({
    target: `${PREDICT_PKG}::range_key::new`,
    arguments: [tx.pure.id(p.oracleId), tx.pure.u64(p.expiry), tx.pure.u64(p.lowerStrike), tx.pure.u64(p.higherStrike)],
  });

  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint_range`,
    typeArguments: [DUSDC_TYPE],
    arguments: [tx.object(PREDICT_OBJECT_ID), manager, tx.object(p.oracleId), key, tx.pure.u64(p.quantity), tx.object(CLOCK_ID)],
  });

  return tx;
}

/** devInspect-only PTB for range cost/payout preview. */
export function buildRangePreviewTx(args: {
  oracleId: string;
  expiry: number;
  lowerStrike: number;
  higherStrike: number;
  quantity: bigint;
}): Transaction {
  const tx = new Transaction();
  const key = tx.moveCall({
    target: `${PREDICT_PKG}::range_key::new`,
    arguments: [tx.pure.id(args.oracleId), tx.pure.u64(args.expiry), tx.pure.u64(args.lowerStrike), tx.pure.u64(args.higherStrike)],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::get_range_trade_amounts`,
    arguments: [tx.object(PREDICT_OBJECT_ID), tx.object(args.oracleId), key, tx.pure.u64(args.quantity), tx.object(CLOCK_ID)],
  });
  return tx;
}

export interface RedeemRangeParams {
  managerId: string;
  oracleId: string;
  expiry: number;
  lowerStrike: number;
  higherStrike: number;
  quantity: bigint;
}

/** Redeem a range position — mirror of buildRedeemTx for the range path. */
export function buildRedeemRangeTx(p: RedeemRangeParams): Transaction {
  const tx = new Transaction();
  const key = tx.moveCall({
    target: `${PREDICT_PKG}::range_key::new`,
    arguments: [tx.pure.id(p.oracleId), tx.pure.u64(p.expiry), tx.pure.u64(p.lowerStrike), tx.pure.u64(p.higherStrike)],
  });
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::redeem_range`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(PREDICT_OBJECT_ID),
      tx.object(p.managerId),
      tx.object(p.oracleId),
      key,
      tx.pure.u64(p.quantity),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}
