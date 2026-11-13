/**
 * Tips and pay-in-DM (#13). A tip is a plain on-chain transfer of SUI or USDC.
 * What's private is the CONTEXT: the note travels as a payment message inside
 * the sender↔recipient DM, which the messaging SDK encrypts with Seal, so only
 * those two can read it. The payment itself stays public on-chain: amount,
 * sender and recipient are visible. Nothing here hides them.
 */
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";

export interface TipCoin {
  symbol: "SUI" | "USDC";
  type: string;
  decimals: number;
}

/** ReeF's testnet "USDC": the dUSDC the indexer faucet drips to new users.
 *  On mainnet pass Circle's native USDC type instead. */
export const TESTNET_TIP_USDC_TYPE = "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";

export function tipCoins(usdcType: string = TESTNET_TIP_USDC_TYPE): TipCoin[] {
  return [
    { symbol: "USDC", type: usdcType, decimals: 6 },
    { symbol: "SUI", type: "0x2::sui::SUI", decimals: 9 },
  ];
}

/**
 * Parse a human amount ("2", "0.5", "1.25") into base units without floating
 * point. Returns null for anything that isn't a positive decimal with at most
 * `decimals` places.
 */
export function toBaseUnits(amount: string, decimals: number): bigint | null {
  const s = amount.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole = "", frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  const units = BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  return units > 0n ? units : null;
}

/** Base units → a trimmed human string ("2", "0.5"). */
export function formatUnits(units: bigint | string, decimals: number): string {
  const v = BigInt(units);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export interface TipParams {
  recipient: string;
  coinType: string;
  /** base units */
  amount: bigint;
}

/**
 * Send `amount` of `coinType` to `recipient`. Built from the sender's OWN coins
 * or address balance (`useGasCoin: false`), so it works inside a sponsored
 * transaction, where the gas coin belongs to the sponsor.
 */
export function buildTipTx(p: TipParams): Transaction {
  if (p.amount <= 0n) throw new Error("tip amount must be positive");
  const tx = new Transaction();
  const coin = tx.add(coinWithBalance({ type: p.coinType, balance: p.amount, useGasCoin: false }));
  tx.transferObjects([coin], tx.pure.address(normalizeSuiAddress(p.recipient)));
  return tx;
}
