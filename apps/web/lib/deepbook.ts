"use client";

import { useMemo } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { type DeepBookCompatibleClient, testnetCoins } from "@mysten/deepbook-v3";
import { deepbook } from "@umbra/core";
import { useSocialAccount } from "./account";

/** The demo creator coin + its DeepBook pool (testnet). */
export const SULTAN = {
  symbol: "SULTAN",
  packageId: "0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b",
  type: "0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b::creator_coin::CREATOR_COIN",
  scalar: 1_000_000_000,
} as const;

export const SULTAN_POOL = {
  key: "SULTAN_DEEP",
  id: "0xa642193580f83b979fda6e3bcb765cfa15bfaeba3227f059bed124631a1e29f8",
  base: "SULTAN",
  quote: "DEEP",
} as const;

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** DeepBook client configured with our creator coin + pool (for reads + tx building). */
export function useDeepBook() {
  const client = useSuiClient();
  const account = useSocialAccount();
  return useMemo(
    () =>
      deepbook.createDeepBookClient({
        client: client as unknown as DeepBookCompatibleClient,
        address: account?.address ?? ZERO,
        coins: { ...testnetCoins, SULTAN: { address: SULTAN.packageId, type: SULTAN.type, scalar: SULTAN.scalar } },
        pools: { SULTAN_DEEP: { address: SULTAN_POOL.id, baseCoin: "SULTAN", quoteCoin: "DEEP" } },
      }),
    [client, account?.address],
  );
}
