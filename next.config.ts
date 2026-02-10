import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid Next.js inferring the workspace root incorrectly due to other lockfiles/package.json on disk.
  turbopack: {
    root: __dirname,
  },
  // Also helps Next resolve dependencies correctly in nested repos.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
