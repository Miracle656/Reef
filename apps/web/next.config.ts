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
};

export default nextConfig;
