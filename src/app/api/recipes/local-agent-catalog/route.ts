import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import YAML from "yaml";
import { getBuiltinRecipesDir, getWorkspaceRecipesDir } from "@/lib/paths";
import { splitRecipeFrontmatter } from "@/lib/recipe-team-agents";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { ts: number; items: LocalAgentCatalogItem[] } | null = null;

export type LocalAgentCatalogItem =
  | {
      kind: "team-role";
      recipeId: string;
      recipeName?: string;
      roleId: string;
      roleName?: string;
    }
  | {
      kind: "single-agent";
      recipeId: string;
      recipeName?: string;
      description?: string;
    };

function parseRecipeFrontmatter(md: string): unknown {
  // openclaw CLI (or plugin runner) can sometimes prepend banners/warnings.
  // Find the first frontmatter marker and parse from there.
  const start = md.indexOf("---\n");
  if (start === -1) throw new Error("Recipe markdown must include YAML frontmatter (---)");
  const sliced = md.slice(start);
  const { yamlText } = splitRecipeFrontmatter(sliced);
  return YAML.parse(yamlText) as unknown;
}

async function listLocalRecipeFiles(): Promise<Array<{ id: string; filePath: string }>> {
  const workspaceDir = await getWorkspaceRecipesDir();
  const builtinDir = await getBuiltinRecipesDir();

  async function readDir(dir: string): Promise<string[]> {
    try {
      const ents = await fs.readdir(dir, { withFileTypes: true });
      return ents.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name);
    } catch {
      return [];
    }
  }

  const workspaceFiles = await readDir(workspaceDir);
  const builtinFiles = await readDir(builtinDir);

  // Prefer workspace overrides over builtin (same id).
  const byId = new Map<string, string>();
  for (const f of builtinFiles) byId.set(path.basename(f, ".md"), path.join(builtinDir, f));
  for (const f of workspaceFiles) byId.set(path.basename(f, ".md"), path.join(workspaceDir, f));

  return Array.from(byId.entries())
    .map(([id, filePath]) => ({ id, filePath }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function extractCatalogItems(recipeId: string, md: string): LocalAgentCatalogItem[] {
  let fmRaw: unknown;
  try {
    fmRaw = parseRecipeFrontmatter(md);
  } catch {
    return [];
  }

  const fm = (fmRaw && typeof fmRaw === "object") ? (fmRaw as Record<string, unknown>) : {};
  const kind = String(fm["kind"] ?? "").trim();
  const recipeName = String(fm["name"] ?? recipeId).trim() || recipeId;

  const out: LocalAgentCatalogItem[] = [];

  if (kind === "team") {
    const agents = Array.isArray(fm["agents"]) ? (fm["agents"] as unknown[]) : [];
    for (const aRaw of agents) {
      const a = (aRaw && typeof aRaw === "object") ? (aRaw as Record<string, unknown>) : {};
      const roleId = String(a["role"] ?? "").trim();
      if (!roleId) continue;
      const roleName = a["name"] ? String(a["name"]).trim() : "";
      out.push({
        kind: "team-role",
        recipeId,
        recipeName,
        roleId,
        roleName: roleName || undefined,
      });
    }
  }

  if (kind === "agent") {
    const description = fm["description"] ? String(fm["description"]).trim() : "";
    out.push({
      kind: "single-agent",
      recipeId,
      recipeName,
      description: description || undefined,
    });
  }

  return out;
}

async function listActiveRecipeIds(): Promise<Set<string>> {
  // Active teams are the ones with an actual workspace-<teamId>/team.json.
  // We'll prefer their recipeId when multiple recipe files define the same roleId.
  const workspaceRoot = path.resolve(await getWorkspaceRecipesDir(), "..");
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  } catch {
    return new Set<string>();
  }

  const active = new Set<string>();

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (!ent.name.startsWith("workspace-")) continue;
    const teamDir = path.join(workspaceRoot, ent.name);
    const metaPath = path.join(teamDir, "team.json");
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      const meta = JSON.parse(raw) as { recipeId?: string };
      const recipeId = String(meta?.recipeId ?? "").trim();
      if (recipeId) active.add(recipeId);
    } catch {
      // ignore
    }
  }

  return active;
}

function dedupeItems(items: LocalAgentCatalogItem[], activeRecipeIds: Set<string>): LocalAgentCatalogItem[] {
  const seenAgents = new Set<string>();
  const bestRoleByRoleId = new Map<string, LocalAgentCatalogItem>();

  for (const it of items) {
    if (it.kind === "single-agent") {
      const key = it.recipeId;
      if (seenAgents.has(key)) continue;
      seenAgents.add(key);
      continue;
    }

    // Team role: dedupe by roleId across all recipes.
    const existing = bestRoleByRoleId.get(it.roleId);
    if (!existing) {
      bestRoleByRoleId.set(it.roleId, it);
      continue;
    }

    // Prefer an item whose recipeId is active.
    const existingActive = activeRecipeIds.has(existing.recipeId);
    const itActive = activeRecipeIds.has(it.recipeId);
    if (existingActive && !itActive) continue;
    if (!existingActive && itActive) {
      bestRoleByRoleId.set(it.roleId, it);
    }

    // Otherwise, keep the first (stable)
  }

  const out: LocalAgentCatalogItem[] = [];
  for (const it of items) {
    if (it.kind === "single-agent") {
      if (!seenAgents.has(it.recipeId)) continue;
      // ensure only first occurrence
      seenAgents.delete(it.recipeId);
      out.push(it);
    }
  }

  for (const v of bestRoleByRoleId.values()) out.push(v);

  return out;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, items: cache.items, cached: true });
  }

  const files = await listLocalRecipeFiles();

  const itemsRaw: LocalAgentCatalogItem[] = [];
  for (const r of files) {
    let md = "";
    try {
      md = await fs.readFile(r.filePath, "utf8");
    } catch {
      continue;
    }
    itemsRaw.push(...extractCatalogItems(r.id, md));
  }

  const activeRecipeIds = await listActiveRecipeIds();
  const items = dedupeItems(itemsRaw, activeRecipeIds);

  // Stable ordering: team roles first, then agents.
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "team-role" ? -1 : 1;
    const ar = a.recipeId.localeCompare(b.recipeId);
    if (ar) return ar;
    if (a.kind === "team-role" && b.kind === "team-role") return a.roleId.localeCompare(b.roleId);
    return 0;
  });

  cache = { ts: now, items };
  return NextResponse.json({ ok: true, items, cached: false });
}
