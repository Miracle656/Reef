"use client";

import { useMemo } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { type DeepBookCompatibleClient, testnetCoins, testnetPools } from "@mysten/deepbook-v3";
import { deepbook } from "@umbra/core";
import { useSocialAccount } from "./account";

/** The demo creator coin + its pool (testnet). */
export const SULTAN = {
  symbol: "SULTAN",
  packageId: "0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b",
  type: "0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b::creator_coin::CREATOR_COIN",
  scalar: 1_000_000_000,
} as const;

export const SULTAN_POOL_ID = "0xa642193580f83b979fda6e3bcb765cfa15bfaeba3227f059bed124631a1e29f8";

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** All coins + pools the terminal knows: DeepBook testnet presets + our creator coin/pool. */
export const COINS = {
  ...testnetCoins,
  SULTAN: { address: SULTAN.packageId, type: SULTAN.type, scalar: SULTAN.scalar },
};

export const POOLS = {
  ...testnetPools,
  SULTAN_DEEP: { address: SULTAN_POOL_ID, baseCoin: "SULTAN", quoteCoin: "DEEP" },
};

export interface Pair {
  key: string;
  base: string;
  quote: string;
  address: string;
}

/** Tradeable pairs for the selector (SULTAN first, then the DeepBook presets). */
export const PAIRS: Pair[] = Object.entries(POOLS)
  .map(([key, p]) => ({ key, base: (p as { baseCoin: string }).baseCoin, quote: (p as { quoteCoin: string }).quoteCoin, address: (p as { address: string }).address }))
  .sort((a, b) => (a.key === "SULTAN_DEEP" ? -1 : b.key === "SULTAN_DEEP" ? 1 : a.key.localeCompare(b.key)));

/** DeepBook client configured with every coin + pool (reads + tx building). */
export function useDeepBook() {
  const client = useSuiClient();
  const account = useSocialAccount();
  return useMemo(
    () =>
      deepbook.createDeepBookClient({
        client: client as unknown as DeepBookCompatibleClient,
        address: account?.address ?? ZERO,
        coins: COINS,
        pools: POOLS,
      }),
    [client, account?.address],
  );
}
