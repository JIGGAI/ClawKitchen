#!/usr/bin/env node
/**
 * Generates a refactoring opportunities report.
 * Run after `npm run coverage` for coverage data.
 *
 * Uses ripgrep (rg) when available; falls back to Node.js file search when not.
 * Output: refactor-report.md
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const SRC = "src";
const REPORT = "refactor-report.md";

const RG_ARGS = ["--type-add", "ts:*.{ts,tsx}", "-t", "ts", "-g", "!*.test.ts", "-g", "!*.test.tsx"];

function rgAvailable() {
  try {
    const r = spawnSync("rg", ["--version"], { encoding: "utf8" });
    return r.status === 0;
  } catch {
    return false;
  }
}

async function globTsFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== "node_modules") {
      await globTsFiles(p, files);
    } else if (e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
      files.push(p);
    }
  }
  return files;
}

function runRg(pattern, extraArgs = []) {
  if (rgAvailable()) {
    try {
      const r = spawnSync(
        "rg",
        [pattern, SRC, "-n", ...RG_ARGS, ...extraArgs],
        { encoding: "utf8", maxBuffer: 1024 * 1024 }
      );
      if (r.status !== 0) return [];
      return r.stdout.trim().split("\n").filter(Boolean);
    } catch {
      // fall through to Node fallback
    }
  }
  return [];
}

/** Node fallback: returns unique file paths containing the search substring. */
async function nodeGrepCount(...substrs) {
  const root = path.join(process.cwd(), SRC);
  const files = await globTsFiles(root);
  const found = new Set();
  for (const f of files) {
    try {
      const content = await fs.readFile(f, "utf8");
      const rel = path.relative(process.cwd(), f);
      if (substrs.every((s) => content.includes(s))) {
        found.add(rel);
      }
    } catch {
      // skip
    }
  }
  return [...found];
}

function runRgCount(pattern) {
  if (!rgAvailable()) return [];
  try {
    const r = spawnSync("rg", [pattern, SRC, "--count", ...RG_ARGS], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    if (r.status !== 0) return [];
    return r.stdout.trim().split("\n").filter(Boolean).map((line) => line.split(":")[0]);
  } catch {
    return [];
  }
}

async function getCoverageGaps() {
  const summaryPath = path.join(process.cwd(), "coverage", "coverage-summary.json");
  try {
    const raw = await fs.readFile(summaryPath, "utf8");
    const summary = JSON.parse(raw);
    const gaps = [];
    const threshold = 80;
    for (const [file, data] of Object.entries(summary)) {
      if (file === "total") continue;
      const pct = data?.lines?.pct ?? data?.statements?.pct ?? 0;
      if (typeof pct === "number" && pct < threshold && file.includes("src/")) {
        gaps.push({ file, pct: Math.round(pct) });
      }
    }
    return gaps
      .map((g) => ({ file: g.file.replace(/^.*\/src\//, "src/"), pct: g.pct }))
      .sort((a, b) => a.pct - b.pct);
  } catch {
    return [];
  }
}

async function main() {
  const sections = [];

  // 1. Coverage gaps
  const gaps = await getCoverageGaps();
  sections.push(`## 1. Coverage gaps (below 80%)

${gaps.length === 0 ? "Run \`npm run coverage\` first. No coverage-summary.json found or no gaps." : gaps.map((g) => `- \`${g.file}\` (${g.pct}%)`).join("\n")}
`);

  // 2. Remaining raw error extraction (should use errorMessage)
  const errorInstanceOf = runRg("e instanceof Error \\? e\\.message : String\\(e\\)");
  sections.push(`## 2. Raw error extraction (consider errorMessage util)

${errorInstanceOf.length === 0 ? "None found. Good." : errorInstanceOf.map((l) => `- \`${l}\``).join("\n")}
`);

  // 3. Inline body types (await req.json()) as {...}
  const inlineBodyTypes = runRg("\\(await req\\.json\\(\\)\\) as \\{");
  sections.push(`## 3. Inline API body types (could move to shared types)

${inlineBodyTypes.length === 0 ? "None found." : inlineBodyTypes.map((l) => `- \`${l}\``).join("\n")}
`);

  // 4. Fetch patterns (count) - use Node fallback when rg unavailable
  let fetchApi = runRgCount("fetch\\(.*/api/");
  let resOk = runRgCount("if \\(!res\\.ok\\)");
  if (!rgAvailable()) {
    fetchApi = await nodeGrepCount("fetch(", "/api/");
    resOk = await nodeGrepCount("!res.ok");
  }
  sections.push(`## 4. Fetch / res.ok pattern counts

- \`fetch(\`/api/\`\`: ${fetchApi.length} files
- \`if (!res.ok)\`: ${resOk.length} files

Consider centralizing with a fetchJson helper.
`);

  // 5. JSON.parse with inline cast
  const jsonParseCast = runRg("JSON\\.parse\\([^)]+\\) as \\{");
  sections.push(`## 5. JSON.parse with inline type cast

${jsonParseCast.length === 0 ? "None found." : jsonParseCast.map((l) => `- \`${l}\``).join("\n")}
`);

  const report = `# Refactor Report

Generated: ${new Date().toISOString()}

${sections.join("\n---\n\n")}
`;

  await fs.writeFile(REPORT, report, "utf8");
  console.log(`Wrote ${REPORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
