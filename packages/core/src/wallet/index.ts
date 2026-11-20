/**
 * ReeF wallet: a user's balances and plain transfers on the "value" network.
 *
 * The social app runs on testnet; money (USDC, USDSUI, cash-out to naira) runs on
 * mainnet. A zkLogin or passkey address is the same on both networks, so the
 * wallet is the user's existing account, just read through another client.
 *
 * Stablecoin sends use Sui's protocol-level **gasless stablecoin transfers**
 * (mainnet, May 2026; also on testnet): a transaction that only calls
 * `0x2::balance::send_funds<T>` for an allow-listed stablecoin runs with gas
 * price 0 and no gas payment, so the user needs no SUI and ReeF needs no
 * sponsor. The SDK detects eligibility when the transaction is built with a
 * gRPC or GraphQL client. The recipient is credited in its **address balance**
 * (not a new `Coin` object).
 * https://docs.sui.io/develop/transaction-payment/gasless-stablecoin-transfers
 */
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { fullnodeUrl, type SuiNetwork } from "../config";

export type WalletNetwork = Extract<SuiNetwork, "mainnet" | "testnet">;

export interface WalletCoin {
  /** ticker shown in the UI, also the stable key for this coin */
  symbol: string;
  name: string;
  /** full Move coin type */
  type: string;
  decimals: number;
  /** on Sui's gasless-transfer allowlist: sending it costs no gas */
  gasless: boolean;
  /** pegged to one US dollar, so a balance can be shown as dollars */
  stable: boolean;
}

export interface WalletConfig {
  network: WalletNetwork;
  fullnodeUrl: string;
  coins: WalletCoin[];
}

export const SUI_COIN_TYPE = "0x2::sui::SUI";

/** The only network the wallet can swap on (see `swap` in this package: SUI to USDC on DeepBook). */
export const SWAP_NETWORK: WalletNetwork = "mainnet";

/** Circle's native USDC on Sui mainnet. */
export const MAINNET_USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
/** USDsui ("Sui Dollar", issued through Bridge) on Sui mainnet. */
export const MAINNET_USDSUI_TYPE = "0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI";
/** Circle's testnet USDC (free from https://faucet.circle.com, "Sui Testnet"). */
export const TESTNET_USDC_TYPE = "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

const SUI: WalletCoin = { symbol: "SUI", name: "Sui", type: SUI_COIN_TYPE, decimals: 9, gasless: false, stable: false };

const COINS: Record<WalletNetwork, WalletCoin[]> = {
  mainnet: [
    { symbol: "USDC", name: "USD Coin", type: MAINNET_USDC_TYPE, decimals: 6, gasless: true, stable: true },
    { symbol: "USDSUI", name: "Sui Dollar", type: MAINNET_USDSUI_TYPE, decimals: 6, gasless: true, stable: true },
    SUI,
  ],
  testnet: [{ symbol: "USDC", name: "USD Coin (test)", type: TESTNET_USDC_TYPE, decimals: 6, gasless: true, stable: true }, SUI],
};

/** Coins and endpoint for the wallet on `network`. */
export function walletConfig(network: WalletNetwork): WalletConfig {
  return { network, fullnodeUrl: fullnodeUrl(network), coins: COINS[network] };
}

/** Parses `NEXT_PUBLIC_WALLET_NETWORK`-style env values. Anything else means "wallet off". */
export function parseWalletNetwork(value: string | undefined): WalletNetwork | null {
  const v = value?.trim().toLowerCase();
  return v === "mainnet" || v === "testnet" ? v : null;
}

// ---- amounts (exact: money never touches floating point) ---------------------

/**
 * `"12.5"` with 6 decimals -> `12500000n`. Accepts digits with an optional
 * fraction (and thousands commas). Throws on anything else, including more
 * fraction digits than the coin has, rather than silently rounding money.
 */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const s = amount.trim().replace(/,/g, "");
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) throw new Error("Enter an amount");
  const whole = m[1] || "0";
  const frac = m[2] ?? "";
  if (frac.length > decimals) throw new Error(`Use at most ${decimals} decimal places`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/** `12500000n` with 6 decimals -> `"12.5"`. Exact; trailing zeros dropped. */
export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/**
 * Display form: thousands separators and at most `maxFractionDigits`, always
 * rounded DOWN so the UI never shows more than the account holds.
 * `1234567890n` (6 decimals) -> `"1,234.56"`.
 */
export function formatAmount(value: bigint, decimals: number, maxFractionDigits = 2, minFractionDigits = 2): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFractionDigits);
  frac = frac.replace(/0+$/, "").padEnd(Math.min(minFractionDigits, maxFractionDigits), "0");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

// ---- balances ---------------------------------------------------------------

export interface WalletBalance {
  coin: WalletCoin;
  /** everything the address holds in this coin, in base units */
  total: bigint;
  /** part held as `Coin` objects */
  inCoins: bigint;
  /** part held in the address balance (where gasless transfers land) */
  inAddressBalance: bigint;
}

/** Read `owner`'s balance of every wallet coin. */
export async function getWalletBalances(client: ClientWithCoreApi, owner: string, coins: WalletCoin[]): Promise<WalletBalance[]> {
  return Promise.all(
    coins.map(async (coin) => {
      const { balance } = await client.core.getBalance({ owner, coinType: coin.type });
      return {
        coin,
        total: BigInt(balance.balance),
        inCoins: BigInt(balance.coinBalance),
        inAddressBalance: BigInt(balance.addressBalance),
      };
    }),
  );
}

/** Dollar value of the stablecoin balances, in 6-decimal base units. */
export function stableTotal(balances: WalletBalance[]): bigint {
  return balances.reduce((sum, b) => {
    if (!b.coin.stable) return sum;
    // normalize to 6 decimals so differently-scaled stables add up
    const d = b.coin.decimals;
    return sum + (d >= 6 ? b.total / 10n ** BigInt(d - 6) : b.total * 10n ** BigInt(6 - d));
  }, 0n);
}

/**
 * Dollar prices of coins that aren't dollars themselves (SUI), by symbol, in
 * millionths of a dollar per whole coin. A missing entry means "no price right now".
 */
export type UsdPrices = Readonly<Record<string, bigint | undefined>>;

export interface WalletValue {
  /** everything that could be valued, in millionths of a dollar */
  total: bigint;
  /** the dollar coins alone (exact) */
  dollars: bigint;
  /** what each priced coin is worth at its market price, by symbol (an estimate) */
  priced: Record<string, bigint>;
  /** coins held that have no price right now, so they are NOT in `total` */
  unpriced: WalletBalance[];
}

/**
 * What the wallet is worth in dollars: the dollar coins at face value, plus
 * every other coin at its market price. Rounded DOWN, like every amount shown.
 * A coin that is held but has no price is left out of the total and listed in
 * `unpriced`, so the screen can say so instead of quietly showing less.
 */
export function walletValue(balances: WalletBalance[], prices: UsdPrices = {}): WalletValue {
  const value: WalletValue = { total: 0n, dollars: stableTotal(balances), priced: {}, unpriced: [] };
  for (const b of balances) {
    if (b.coin.stable || b.total <= 0n) continue;
    const price = prices[b.coin.symbol];
    if (price === undefined || price <= 0n) {
      value.unpriced.push(b);
      continue;
    }
    value.priced[b.coin.symbol] = (b.total * price) / 10n ** BigInt(b.coin.decimals);
  }
  value.total = value.dollars + Object.values(value.priced).reduce((sum, v) => sum + v, 0n);
  return value;
}

// ---- sending ----------------------------------------------------------------

/** The network refuses gasless transfers below 0.01 of the coin. */
export function minSendAmount(coin: WalletCoin): bigint {
  return coin.gasless ? 10n ** BigInt(Math.max(coin.decimals - 2, 0)) : 1n;
}

export class WalletInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletInputError";
  }
}

/** Normalized recipient, or throws a message fit for the form. */
export function parseRecipient(value: string): string {
  const v = value.trim();
  // A full address only: a short one is almost always a typo, and normalizing
  // it would silently pad it into a different (wrong) account.
  if (!/^0x[0-9a-fA-F]{64}$/.test(v) || !isValidSuiAddress(v)) {
    throw new WalletInputError("Enter a full Sui address (0x followed by 64 characters)");
  }
  return normalizeSuiAddress(v);
}

export interface SendParams {
  sender: string;
  coin: WalletCoin;
  /** base units */
  amount: bigint;
  /** a full Sui address */
  recipient: string;
}

/**
 * Transfer `amount` of `coin` from `sender` to `recipient`.
 *
 * Gasless coins go through `balance::send_funds` alone, which is the shape the
 * protocol runs for free (the SDK sets gas price 0 at build time). SUI is sent
 * the ordinary way and pays its own gas.
 */
export function buildSendTx(p: SendParams): Transaction {
  const recipient = parseRecipient(p.recipient);
  const sender = normalizeSuiAddress(p.sender);
  if (p.amount <= 0n) throw new WalletInputError("Enter an amount");
  const min = minSendAmount(p.coin);
  if (p.amount < min) throw new WalletInputError(`The smallest amount you can send is ${formatUnits(min, p.coin.decimals)} ${p.coin.symbol}`);
  if (recipient === sender) throw new WalletInputError("That's your own address");

  const tx = new Transaction();
  tx.setSender(sender);
  if (p.coin.gasless) {
    tx.moveCall({
      target: "0x2::balance::send_funds",
      typeArguments: [p.coin.type],
      arguments: [tx.balance({ type: p.coin.type, balance: p.amount }), tx.pure.address(recipient)],
    });
  } else {
    tx.transferObjects([tx.coin({ type: p.coin.type, balance: p.amount })], tx.pure.address(recipient));
  }
  return tx;
}

/** True once a BUILT transaction was accepted as gasless (gas price 0, no payment). */
export function isGaslessBuilt(tx: Transaction): boolean {
  const gas = tx.getData().gasData;
  return gas.price != null && BigInt(gas.price) === 0n && (gas.payment?.length ?? 0) === 0;
}

// ---- explorer links ---------------------------------------------------------

export function explorerTxUrl(network: WalletNetwork, digest: string): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

export function explorerAddressUrl(network: WalletNetwork, address: string): string {
  return `https://suiscan.xyz/${network}/account/${address}`;
}
