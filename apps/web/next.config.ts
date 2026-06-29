import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo root (silences the multi-lockfile workspace-root warning).
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Workspace packages ship raw TypeScript; let Next transpile them.
  transpilePackages: ["@umbra/core", "@umbra/ui"],
  images: {
    // Walrus aggregators serve user media.
    remotePatterns: [{ protocol: "https", hostname: "*.walrus.space" }],
  },
  webpack: (config) => {
    // axios (via @mysten/deepbook-v3) pulls Node-only HTTP proxy agents the
    // browser never needs, and whose hoisted version (agent-base@6) conflicts
    // with Metro's agent-base@7 at the monorepo root. We make no proxied
    // requests, so stub them out to avoid the resolution clash.
    config.resolve.alias = {
      ...config.resolve.alias,
      "agent-base": false,
      "https-proxy-agent": false,
      "http-proxy-agent": false,
    };
    return config;
  },
};

export default nextConfig;
