import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid Next.js inferring the workspace root incorrectly due to other lockfiles/package.json on disk.
  turbopack: {
    root: __dirname,
  },
  // Also helps Next resolve dependencies correctly in nested repos.
  outputFileTracingRoot: __dirname,

  // Required so we can ship a prebuilt server bundle (no npm commands for end users).
  output: "standalone",

  // Tell Next.js not to bundle better-sqlite3 (native module).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
