import { createSuiClient, executeGasless } from "@umbra/core";
import type { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { NETWORK, SPONSOR_API_URL, SPONSOR_MODE, umbraConfig } from "./config";
import { enokiFlow } from "./enoki";
import { useAuth } from "./auth";

const client = createSuiClient(umbraConfig);

/**
 * Gasless action via the configured sponsor (Enoki by default, or the self-run
 * sponsor): the zkLogin keypair from EnokiFlow signs the final bytes.
 */
export function useGasless() {
  const { address } = useAuth();

  return async (tx: Transaction): Promise<{ digest: string }> => {
    if (!address) throw new Error("Sign in first");
    const keypair = await enokiFlow.getKeypair({ network: NETWORK });
    return executeGasless(SPONSOR_MODE, {
      sponsorUrl: SPONSOR_API_URL,
      client,
      tx,
      sender: address,
      network: NETWORK,
      sign: async (sponsoredBytes) => {
        const { signature } = await keypair.signTransaction(fromBase64(sponsoredBytes));
        return { signature };
      },
    });
  };
}
