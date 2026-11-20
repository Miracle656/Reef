/**
 * SERVER-SIDE. SUI's dollar price, read from DeepBook's on-chain SUI/USDC order
 * book. No price service and no API key: it comes from the same Sui node the
 * wallet already talks to, and it is what SUI really trades for on Sui.
 *
 * It is only ever used to SHOW what a balance is worth. No amount that moves
 * money is worked out from it: a swap is quoted and simulated on its own, and
 * cash-out gets its rate from the payout provider.
 *
 * Lives outside the client bundle on purpose (it pulls in the DeepBook SDK);
 * the web app serves it from `/api/prices`.
 */
import { DeepBookClient, type DeepBookCompatibleClient } from "@mysten/deepbook-v3";
import type { WalletNetwork } from "./index";

/** The market read on each network. Testnet's is a test market, good only for showing test money. */
const SUI_MARKET: Record<WalletNetwork, string> = { mainnet: "SUI_USDC", testnet: "SUI_DBUSDC" };

/** A wider gap than this between the best offer to buy and to sell means the book is too thin to take a price from. */
const MAX_SPREAD = 0.02;

/** DeepBook reads need a sender; nothing is signed or sent. */
const NOBODY = `0x${"0".repeat(64)}`;

export interface BookTop {
  /** best prices people will buy at, highest first */
  bid_prices: number[];
  /** best prices people will sell at, lowest first */
  ask_prices: number[];
}

/**
 * The price halfway between the best bid and the best ask, in millionths of a
 * dollar, or null when the book has no two sides or they are far apart.
 */
export function priceFromBook(book: BookTop): bigint | null {
  const bid = book.bid_prices[0];
  const ask = book.ask_prices[0];
  if (bid === undefined || ask === undefined) return null;
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask < bid) return null;
  const mid = (bid + ask) / 2;
  if ((ask - bid) / mid > MAX_SPREAD) return null;
  return BigInt(Math.floor(mid * 1_000_000));
}

/** SUI's price in millionths of a dollar, or null if it can't be read right now. */
export async function readSuiUsdPrice(client: DeepBookCompatibleClient, network: WalletNetwork): Promise<bigint | null> {
  const book = new DeepBookClient({ client, address: NOBODY, network });
  return priceFromBook(await book.getLevel2TicksFromMid(SUI_MARKET[network], 1));
}
