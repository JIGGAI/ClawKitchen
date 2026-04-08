import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ── Manifest types (mirrors ClawRecipes src/lib/kitchen-manifest.ts) ────────

export interface KitchenManifest {
  version: 1;
  generatedAt: string;
  teams: Record<string, TeamManifestEntry>;
  agents: AgentManifestEntry[];
  recipes: RecipeManifestEntry[];
}

export interface TeamManifestEntry {
  teamId: string;
  displayName: string | null;
  roles: string[];
  ticketCounts: {
    backlog: number;
    "in-progress": number;
    testing: number;
    done: number;
    total: number;
  };
  activeRunCount: number;
}

export interface AgentManifestEntry {
  id: string;
  identityName?: string;
  workspace?: string;
  model?: string;
  isDefault?: boolean;
}

export interface RecipeManifestEntry {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
}

// ── Reader ──────────────────────────────────────────────────────────────────

const MANIFEST_PATH = path.join(os.homedir(), ".openclaw", "kitchen-manifest.json");

/** Max age in ms before we consider the manifest stale and trigger background regen. */
const STALE_THRESHOLD_MS = 10_000;

/**
 * Read the kitchen manifest. Returns null if the file is missing or unparseable.
 */
export async function readManifest(): Promise<KitchenManifest | null> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as KitchenManifest;
    if (!parsed || parsed.version !== 1 || !parsed.generatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check whether the manifest is stale (older than STALE_THRESHOLD_MS).
 */
export function isManifestStale(manifest: KitchenManifest): boolean {
  const age = Date.now() - new Date(manifest.generatedAt).getTime();
  return age > STALE_THRESHOLD_MS;
}

/**
 * Fire-and-forget: trigger manifest regeneration via the openclaw CLI.
 * Does not block — errors are silently logged.
 */
export function triggerManifestRegeneration(): void {
  // Dynamic import to avoid pulling in openclaw.ts at module level
  import("./openclaw").then(({ runOpenClaw }) => {
    runOpenClaw(["recipes", "kitchen-manifest"]).catch(() => {
      // best-effort — if regen fails, next request will try again
    });
  }).catch(() => {});
}
