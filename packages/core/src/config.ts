/** Runtime configuration shared by all Umbra surfaces (web, mobile, indexer). */
export type SuiNetwork = "testnet" | "mainnet" | "devnet";

export interface WalrusConfig {
  /** publisher endpoints (PUT blobs), tried in order with fallback */
  publishers: string[];
  /** aggregator endpoints (GET blobs) */
  aggregators: string[];
  /** default storage duration in epochs for new blobs */
  defaultEpochs: number;
}

export interface UmbraConfig {
  network: SuiNetwork;
  fullnodeUrl: string;
  /** published `umbra` package id */
  packageId: string;
  /** shared Registry object id */
  registryId: string;
  /** shared Clock — always 0x6 */
  clockId: string;
  walrus: WalrusConfig;
}

/** The shared Clock object id, identical on every network. */
export const SUI_CLOCK_ID = "0x6";

/** Public Walrus testnet endpoints (verified live in reference apps). */
export const WALRUS_TESTNET: WalrusConfig = {
  publishers: [
    "https://publisher.walrus-testnet.walrus.space/v1/blobs",
    "https://walrus-testnet-publisher.nodes.guru/v1/blobs",
    "https://walrus-testnet-publisher.stakely.io/v1/blobs",
  ],
  aggregators: [
    "https://aggregator.walrus-testnet.walrus.space/v1/blobs",
    "https://walrus-testnet-aggregator.nodes.guru/v1/blobs",
  ],
  // Testnet epochs are 1 day; 53 is the max a blob can be stored ahead. The
  // durable fix is the server-side renewal job (extend blobs nearing expiry).
  defaultEpochs: 53,
};

const FULLNODE: Record<SuiNetwork, string> = {
  // Mysten deprecated JSON-RPC on the public fullnodes (Aug 2026) — publicnode
  // still serves the full JSON-RPC surface for testnet.
  testnet: "https://sui-testnet-rpc.publicnode.com",
  mainnet: "https://fullnode.mainnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

/** Build a config from package/registry ids (testnet defaults). */
export function testnetConfig(packageId: string, registryId: string): UmbraConfig {
  return {
    network: "testnet",
    fullnodeUrl: FULLNODE.testnet,
    packageId,
    registryId,
    clockId: SUI_CLOCK_ID,
    walrus: WALRUS_TESTNET,
  };
}
