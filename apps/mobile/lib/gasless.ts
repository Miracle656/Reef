import { useCallback } from 'react';
import { useEnokiFlow } from '@mysten/enoki/react';
import { fromBase64 } from '@mysten/sui/utils';
import { sponsorAndExecute } from '@umbra/core';
import type { Transaction } from '@mysten/sui/transactions';
import { useSocialAccount } from './account';
import { NETWORK, SPONSOR_API_URL, suiClient } from './config';

export function useGasless() {
  const flow = useEnokiFlow();
  const account = useSocialAccount();

  return useCallback(
    async (tx: Transaction): Promise<{ digest: string }> => {
      if (!account) throw new Error('Sign in first');
      const keypair = await flow.getKeypair({ network: NETWORK });
      return sponsorAndExecute({
        sponsorUrl: SPONSOR_API_URL,
        client: suiClient,
        tx,
        sender: account.address,
        network: NETWORK,
        sign: async (bytes) => {
          const { signature } = await keypair.signTransaction(fromBase64(bytes));
          return { signature };
        },
      });
    },
    [account, flow],
  );
}
