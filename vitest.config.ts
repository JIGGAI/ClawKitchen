import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    exclude: [
      "**/node_modules/**", 
      "**/.next/**", 
      "**/dist/**", 
      "**/build/**",
      // TEMPORARY: Exclude React component tests due to React 19 + @testing-library/react compatibility issue
      // React 19 removed React.act but @testing-library/react@16.3.2 still expects it
      // See: https://github.com/testing-library/react-testing-library/issues/1216
      "src/components/__tests__/**",
      "src/lib/__tests__/use-slugified-id.test.tsx",
      "src/lib/__tests__/goals-client.test.tsx"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "node_modules",
        ".next",
        "**/*.config.{ts,js,mjs}",
        "**/__tests__/**",
      ],
      thresholds: {
        // Restored from 0% to 50% after fixing Node.js externalization issues
        // by switching default test environment from jsdom to node.
        "src/lib/**/*.ts": { statements: 50, lines: 50, functions: 50 },
      },
    },
  },
});
