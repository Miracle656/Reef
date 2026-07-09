import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { UmbraConfig } from "../config";

/**
 * Create a Sui JSON-RPC client for the configured fullnode.
 * (`@mysten/sui` v2 renamed the RPC client to `SuiJsonRpcClient`; the abstract
 * interface is `ClientWithCoreApi` from `@mysten/sui/client`.)
 */
export function createSuiClient(cfg: UmbraConfig): SuiJsonRpcClient {
  return new SuiJsonRpcClient({ url: cfg.fullnodeUrl, network: cfg.network });
}
