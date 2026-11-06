import { useSuiClient } from "@mysten/dapp-kit";
import type { SuiGrpcClient } from "@mysten/sui/grpc";

/**
 * The app's Sui client. dapp-kit 1.x types its context client as JSON-RPC, but
 * `providers.tsx` hands it a `SuiGrpcClient` (Sui shut JSON-RPC off in 2026).
 * Use this instead of `useSuiClient()` so calls are typed against gRPC.
 */
export const useChainClient = () => useSuiClient() as unknown as SuiGrpcClient;
