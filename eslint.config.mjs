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
  // Dev/CI scripts that intentionally invoke CLI tools from PATH.
  {
    files: ["scripts/refactor-report.mjs", "scripts/verify-runtime-package.mjs"],
    rules: { "sonarjs/no-os-command-from-path": "off" },
  },
  // Team editor: large form with multiple tabs; complexity distributed across handlers
  {
    files: ["**/team-editor.tsx"],
    rules: { "sonarjs/cognitive-complexity": ["warn", 40] },
  },
  // Workflow routes/editor: complex form and state machine logic; split would be large refactor
  {
    files: [
      "**/workflow-runs/route.ts",
      "**/workflows-editor-client.tsx",
      "**/workflows/route.ts",
      "**/orchestrator/route.ts",
      "**/orchestrator/install/route.ts",
      "**/swarms/start/route.ts",
      "**/workflows/validate.ts",
    ],
    rules: {
      "sonarjs/cognitive-complexity": ["warn", 45],
      "sonarjs/no-nested-functions": "off",
      "sonarjs/no-nested-conditional": "off",
    },
  },
  // Regex in tickets/move and OrchestratorSetupModal: simple slugify patterns, user input bounded
  {
    files: ["**/tickets/move/route.ts", "**/OrchestratorSetupModal.tsx"],
    rules: { "sonarjs/slow-regex": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    "coverage/**",
    "report/**",
  ]),
]);

export default eslintConfig;
