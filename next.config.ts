import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Avoid Next.js inferring the workspace root incorrectly due to multiple lockfiles on disk.
    root: __dirname,
  },
};

export default nextConfig;
