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
  async headers() {
    // Let the Google OAuth popup (zkLogin) talk back to the opener.
    return [
      {
        source: "/(.*)",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }],
      },
    ];
  },
};

export default nextConfig;
