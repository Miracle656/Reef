import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { UmbraConfig } from "../config";

/**
 * Create a Sui gRPC client for the configured fullnode. Sui JSON-RPC was shut
 * off on public fullnodes in 2026, so everything goes through the transport-
 * agnostic core API (`client.core` / `ClientWithCoreApi`) over gRPC-web.
 */
export function createSuiClient(cfg: UmbraConfig): SuiGrpcClient {
  return new SuiGrpcClient({ baseUrl: cfg.fullnodeUrl, network: cfg.network });
}
