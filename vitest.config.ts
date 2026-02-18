import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "node_modules",
        ".next",
        "**/*.config.{ts,js,mjs}",
        "**/__tests__/**",
      ],
      thresholds: {
        "src/lib/**/*.ts": { statements: 80, lines: 80, functions: 80 },
      },
    },
  },
});
