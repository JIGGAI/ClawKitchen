import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/build/**"],
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
        // NOTE: This threshold is enforced in CI and should be tightened again
        // once the lib coverage baseline is brought back up.
        "src/lib/**/*.ts": { statements: 75, lines: 75, functions: 75 },
      },
    },
  },
});
