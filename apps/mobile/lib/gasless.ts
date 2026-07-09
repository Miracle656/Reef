import { createSuiClient, sponsorAndExecute } from "@umbra/core";
import type { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { NETWORK, SPONSOR_API_URL, umbraConfig } from "./config";
import { enokiFlow } from "./enoki";
import { useAuth } from "./auth";

const client = createSuiClient(umbraConfig);

/**
 * Gasless action: build kind-bytes -> sponsor (Enoki, server) -> sign the
 * sponsored bytes with the zkLogin keypair from EnokiFlow -> execute.
 */
export function useGasless() {
  const { address } = useAuth();

  return async (tx: Transaction): Promise<{ digest: string }> => {
    if (!address) throw new Error("Sign in first");
    const keypair = await enokiFlow.getKeypair({ network: NETWORK });
    return sponsorAndExecute({
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
