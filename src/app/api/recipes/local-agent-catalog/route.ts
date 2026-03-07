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

function dedupeItems(items: LocalAgentCatalogItem[]): LocalAgentCatalogItem[] {
  const seen = new Set<string>();
  const out: LocalAgentCatalogItem[] = [];

  for (const it of items) {
    const key =
      it.kind === "team-role"
        ? `team-role:${it.recipeId}:${it.roleId}`
        : `single-agent:${it.recipeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }

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

  const items = dedupeItems(itemsRaw);

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
