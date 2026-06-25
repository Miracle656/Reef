import { useMemo } from 'react';
import { type DeepBookCompatibleClient, testnetCoins, testnetPools } from '@mysten/deepbook-v3';
import { deepbook } from '@umbra/core';
import { suiClient } from './config';
import { useSocialAccount } from './account';

export const SULTAN = {
  symbol: 'SULTAN',
  packageId: '0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b',
  type: '0x052a466afe35f5db6c6143ed62dcc2e2c28bb64f909b773ed409b71a8b5e0f4b::creator_coin::CREATOR_COIN',
  scalar: 1_000_000_000,
} as const;

export const SULTAN_POOL_ID = '0xa642193580f83b979fda6e3bcb765cfa15bfaeba3227f059bed124631a1e29f8';

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

export const COINS = {
  ...testnetCoins,
  SULTAN: { address: SULTAN.packageId, type: SULTAN.type, scalar: SULTAN.scalar },
};

export const POOLS = {
  ...testnetPools,
  SULTAN_DEEP: { address: SULTAN_POOL_ID, baseCoin: 'SULTAN', quoteCoin: 'DEEP' },
};

export interface Pair {
  key: string;
  base: string;
  quote: string;
  address: string;
}

export const PAIRS: Pair[] = Object.entries(POOLS)
  .map(([key, p]) => ({
    key,
    base: (p as { baseCoin: string }).baseCoin,
    quote: (p as { quoteCoin: string }).quoteCoin,
    address: (p as { address: string }).address,
  }))
  .sort((a, b) => (a.key === 'SULTAN_DEEP' ? -1 : b.key === 'SULTAN_DEEP' ? 1 : a.key.localeCompare(b.key)));

export function useDeepBook() {
  const account = useSocialAccount();
  return useMemo(
    () =>
      deepbook.createDeepBookClient({
        client: suiClient as unknown as DeepBookCompatibleClient,
        address: account?.address ?? ZERO,
        coins: COINS,
        pools: POOLS,
      }),
    [account?.address],
  );
}
