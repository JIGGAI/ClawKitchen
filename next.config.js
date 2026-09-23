/**
 * Plain JavaScript on purpose.
 *
 * Next reads this file when the server starts, and a `.ts` config needs
 * TypeScript installed to be transpiled. TypeScript is a devDependency, so an
 * end user installing the published package never has it: the plugin then dies
 * with `Failed to transpile "next.config.ts"` while the gateway still reports
 * the plugin as loaded. The JSDoc type below keeps editor completion without
 * putting a compiler in the runtime path.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
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

module.exports = nextConfig;
