import type { SuiJsonRpcClient as SuiJsonRpcClientCtor } from "@mysten/sui/jsonRpc";
import type { UmbraConfig } from "../config";

// TEMP DIAGNOSTIC (remove after we capture which subpath fails): probe each
// @mysten/sui subpath leaf-first. The FIRST "[UMBRA] FAIL" is the root cause —
// later subpaths depend on earlier ones. Logs name+message even if stack is empty.
// eslint-disable-next-line no-console
const __umbraProbe = (name: string, load: () => unknown) => {
  try {
    load();
    // eslint-disable-next-line no-console
    console.log("[UMBRA] ok:", name);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[UMBRA] FAIL:", name, "::", e?.name, "::", e?.message, "\n", e?.stack || "(no stack)");
  }
};
// DECISIVE TEST: does `class extends Error` (transpiled to babel's _wrapNativeSuper)
// work on this device's Hermes? @mysten/sui/client → errors.mjs does exactly this.
__umbraProbe("class-extends-Error", () => {
  class _E extends Error {}
  class _F extends _E {
    constructor(m: string) {
      super(m);
    }
  }
  const f = new _F("probe");
  if (!(f instanceof Error)) throw new Error("not instanceof Error");
});
/* eslint-disable @typescript-eslint/no-var-requires */
__umbraProbe("@mysten/sui/client", () => require("@mysten/sui/client"));

let SuiJsonRpcClient: typeof import("@mysten/sui/jsonRpc").SuiJsonRpcClient;
try {
  SuiJsonRpcClient = require("@mysten/sui/jsonRpc").SuiJsonRpcClient;
} catch (e: any) {
  // eslint-disable-next-line no-console
  console.error("[UMBRA] @mysten/sui/jsonRpc failed to load:\n", (e && e.stack) || String(e));
  throw e;
}
/* eslint-enable @typescript-eslint/no-var-requires */

/**
 * Create a Sui JSON-RPC client for the configured fullnode.
 * (`@mysten/sui` v2 renamed the RPC client to `SuiJsonRpcClient`; the abstract
 * interface is `ClientWithCoreApi` from `@mysten/sui/client`.)
 */
export function createSuiClient(cfg: UmbraConfig): SuiJsonRpcClientCtor {
  return new SuiJsonRpcClient({ url: cfg.fullnodeUrl, network: cfg.network });
}
