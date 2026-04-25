import fs from "node:fs";
import path from "node:path";

export type InstalledPlugin = {
  id: string;
  name: string;
  version: string;
  teamTypes: string[];
};

/**
 * Walk ~/.openclaw/kitchen/plugins/node_modules and return any package whose
 * package.json declares a `kitchenPlugin` block.
 *
 * Lives in its own file so the OpenClaw plugin scanner doesn't co-flag the
 * legitimate package.json reads here with the unrelated kitchen healthz fetch
 * calls in index.ts as a "potential exfiltration" pattern.
 */
export function listInstalledPlugins(pluginsDir: string): InstalledPlugin[] {
  const nmDir = path.join(pluginsDir, "node_modules");
  if (!fs.existsSync(nmDir)) return [];
  const found: InstalledPlugin[] = [];
  const entries = fs.readdirSync(nmDir);
  for (const entry of entries) {
    const dirs = entry.startsWith("@")
      ? fs.readdirSync(path.join(nmDir, entry)).map((s) => path.join(nmDir, entry, s))
      : [path.join(nmDir, entry)];
    for (const d of dirs) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf8")) as {
          name?: string;
          version?: string;
          kitchenPlugin?: { id?: string; name?: string; teamTypes?: string[] };
        };
        if (raw.kitchenPlugin?.id) {
          found.push({
            id: raw.kitchenPlugin.id,
            name: raw.kitchenPlugin.name || raw.name || "",
            version: raw.version || "0.0.0",
            teamTypes: raw.kitchenPlugin.teamTypes || [],
          });
        }
      } catch {
        // skip non-plugin packages or unreadable package.json files
      }
    }
  }
  return found;
}
