import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = defineConfig([
  sonarjs.configs.recommended,
  {
    rules: {
      "sonarjs/cognitive-complexity": "warn",
      "sonarjs/no-nested-conditional": "warn",
      "sonarjs/slow-regex": "warn",
      "sonarjs/no-nested-functions": "warn",
      "sonarjs/pseudo-random": "warn",
      "sonarjs/no-duplicate-string": ["warn", { threshold: 4 }],
      "sonarjs/no-duplicated-branches": "warn",
      "sonarjs/no-all-duplicated-branches": "warn",
      "sonarjs/no-duplicate-in-composite": "warn",
      "import/no-duplicates": "warn",
    },
  },
  ...nextVitals,
  ...nextTs,
  // Reduce noise in test files - repeated strings are often intentional (URLs, mock data)
  {
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}"],
    rules: { "sonarjs/no-duplicate-string": "off" },
  },
  // Dev scripts that intentionally invoke CLI tools (rg) from PATH
  {
    files: ["scripts/refactor-report.mjs"],
    rules: { "sonarjs/no-os-command-from-path": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "report/**",
  ]),
]);

export default eslintConfig;
