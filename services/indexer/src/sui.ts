import { createSuiClient, testnetConfig } from "@umbra/core";

/** Shared read client for signature verification (zkLogin needs chain access). */
export const suiClient = createSuiClient({
  ...testnetConfig("0x0", "0x0"),
  ...(process.env.SUI_FULLNODE_URL ? { fullnodeUrl: process.env.SUI_FULLNODE_URL } : {}),
});
