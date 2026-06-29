// DeepBook Predict — Move-call tx builders (binary mint flow).
//
// The deployed `predict::create_manager(ctx)` shares the manager internally and
// returns only its ID, so first-ever use is two signatures:
//   1. buildCreateManagerTx — creates + shares the PredictManager.
//   2. buildDepositMintTx    — funds (optional) + mints in one PTB.
// Later mints are a single signature.

import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { CLOCK_ID, DUSDC_TYPE, PREDICT_OBJECT_ID, PREDICT_PKG } from "./predict";

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
