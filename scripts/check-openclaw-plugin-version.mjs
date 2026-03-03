import fs from "node:fs";
import path from "node:path";

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const repoRoot = process.cwd();
const pkgPath = path.join(repoRoot, "package.json");
const pluginPath = path.join(repoRoot, "openclaw.plugin.json");

const pkg = readJson(pkgPath);
const plugin = readJson(pluginPath);

const pkgVer = String(pkg.version || "").trim();
const pluginVer = String(plugin.version || "").trim();

if (!pkgVer) {
  console.error(`[version-check] package.json is missing version (${pkgPath})`);
  process.exit(1);
}
if (!pluginVer) {
  console.error(`[version-check] openclaw.plugin.json is missing version (${pluginPath})`);
  process.exit(1);
}

if (pkgVer !== pluginVer) {
  console.error(
    [
      "[version-check] Version mismatch:",
      `- package.json version:         ${pkgVer}`,
      `- openclaw.plugin.json version: ${pluginVer}`,
      "",
      "Fix: bump openclaw.plugin.json.version to match package.json before publishing.",
    ].join("\n")
  );
  process.exit(1);
}

console.log(`[version-check] OK: ${pkg.name}@${pkgVer} (manifest version matches)`);
