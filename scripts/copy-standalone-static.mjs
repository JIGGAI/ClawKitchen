import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const from = path.join(root, ".next", "static");
const to = path.join(root, ".next", "standalone", ".next", "static");

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(from))) {
  console.error(`[postbuild] Missing: ${from}`);
  process.exit(1);
}

await fs.mkdir(to, { recursive: true });

// Node 18+ supports fs.cp
await fs.cp(from, to, { recursive: true, force: true });

console.log(`[postbuild] Copied Next static assets:\n- from: ${from}\n- to:   ${to}`);

// ---------------------------------------------------------------------------
// Fix Turbopack hashed external module names.
//
// Turbopack appends a content-hash to externalized native module names in RSC
// server chunks (e.g. "better-sqlite3-90e2652d1716b047").  At runtime Node
// cannot resolve those names because no such package exists in node_modules.
//
// We patch every occurrence back to the bare package name so that the standard
// require("better-sqlite3") works on any machine.
// ---------------------------------------------------------------------------

const HASHED_EXTERNAL_RE = /better-sqlite3-[0-9a-f]{16}/g;
const BARE_NAME = "better-sqlite3";

async function fixHashedExternals(dir) {
  let patched = 0;
  const chunksDir = path.join(dir, ".next", "server", "chunks");
  if (!(await exists(chunksDir))) return patched;

  const entries = await fs.readdir(chunksDir);
  for (const entry of entries) {
    if (!entry.endsWith(".js")) continue;
    const filePath = path.join(chunksDir, entry);
    const content = await fs.readFile(filePath, "utf8");
    if (HASHED_EXTERNAL_RE.test(content)) {
      const fixed = content.replace(HASHED_EXTERNAL_RE, BARE_NAME);
      await fs.writeFile(filePath, fixed, "utf8");
      patched++;
    }
  }
  return patched;
}

// Patch both the source .next and the standalone copy.
let total = 0;
total += await fixHashedExternals(root);
total += await fixHashedExternals(path.join(root, ".next", "standalone"));

if (total > 0) {
  console.log(`[postbuild] Patched ${total} chunk(s): replaced Turbopack hashed external "better-sqlite3-<hash>" → "${BARE_NAME}"`);
} else {
  console.log(`[postbuild] No hashed better-sqlite3 externals found (nothing to patch).`);
}
