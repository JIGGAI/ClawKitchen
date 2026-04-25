import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { runOpenClaw } from "./openclaw";
import { cachedRunOpenClaw } from "./openclaw-cache";
import { getBuiltinRecipesDir, getTeamWorkspaceDir, getWorkspaceRecipesDir } from "./paths";

export type RecipeListItem = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

export type RecipeDetail = RecipeListItem & {
  content: string;
  filePath: string | null;
};

export function parseFrontmatterId(md: string): string {
  if (!md.startsWith("---\n")) throw new Error("Recipe markdown must start with YAML frontmatter (---)");
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Recipe frontmatter not terminated (---)");
  const yamlText = md.slice(4, end + 1);
  const fm = YAML.parse(yamlText) as { id?: string };
  if (!fm?.id) throw new Error("Recipe frontmatter must include id");
  return fm.id;
}

/** Ensures the frontmatter id field matches the given id. Preserves body. Returns md unchanged if no valid frontmatter. */
export function forceFrontmatterId(md: string, id: string): string {
  if (!md.startsWith("---\n")) return md;
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return md;
  const fm = md.slice(4, end);
  const body = md.slice(end + 5);

  const lines = fm.split("\n");
  let found = false;
  const nextLines = lines.map((line) => {
    if (/^id\s*:/i.test(line)) {
      found = true;
      return `id: ${id}`;
    }
    return line;
  });
  if (!found) nextLines.unshift(`id: ${id}`);

  return `---\n${nextLines.join("\n")}\n---\n${body}`;
}

/**
 * Returns display name for an installed team, or null if not found.
 *
 * Reads `~/.openclaw/workspace-<teamId>/team.json` directly — that's the
 * source of truth written when a team is scaffolded. Always fresh, ~1ms file
 * read. Falls back to the (cached) recipe list for unusual cases where a team
 * id maps to a recipe that hasn't been scaffolded into a workspace dir yet.
 */
export async function getTeamDisplayName(teamId: string): Promise<string | null> {
  const id = String(teamId ?? "").trim();
  if (!id) return null;
  try {
    const dir = await getTeamWorkspaceDir(id);
    const raw = await fs.readFile(path.join(dir, "team.json"), "utf8");
    const parsed = JSON.parse(raw) as { recipeName?: unknown; displayName?: unknown };
    const name =
      typeof parsed.recipeName === "string" && parsed.recipeName.trim()
        ? parsed.recipeName.trim()
        : typeof parsed.displayName === "string" && parsed.displayName.trim()
          ? parsed.displayName.trim()
          : null;
    if (name) return name;
  } catch {
    // team.json missing or unreadable — fall through to recipe-list lookup
  }
  const recipes = await listRecipesCached();
  const match = recipes.find((r) => r.kind === "team" && r.id === id);
  return match?.name ?? null;
}

/** Cached variant of listRecipes for hot render paths (server components). */
export async function listRecipesCached(): Promise<RecipeListItem[]> {
  const list = await cachedRunOpenClaw(["recipes", "list"]);
  if (!list.ok) return [];
  try {
    return JSON.parse(list.stdout) as RecipeListItem[];
  } catch {
    return [];
  }
}

/** Fetches recipe list from openclaw. Returns empty array on failure. */
export async function listRecipes(): Promise<RecipeListItem[]> {
  const list = await runOpenClaw(["recipes", "list"]);
  if (!list.ok) return [];
  try {
    return JSON.parse(list.stdout) as RecipeListItem[];
  } catch {
    return [];
  }
}

/** Fetches recipe list and returns the item with the given id, or null. */
export async function findRecipeById(id: string): Promise<RecipeListItem | null> {
  // Use the cached list — `recipes list` is a ~20s subprocess and findRecipeById
  // is called on every /api/recipes/[id] hit (which is the recipe markdown
  // load that fires when any team page mounts). Mutations bust the cache.
  const recipes = await listRecipesCached();
  return recipes.find((r) => r.id === id) ?? null;
}

export async function resolveRecipePath(item: RecipeListItem): Promise<string> {
  const dir = item.source === "builtin" ? await getBuiltinRecipesDir() : await getWorkspaceRecipesDir();
  // Current convention: <id>.md in the directory.
  return path.join(dir, `${item.id}.md`);
}

export async function readRecipe(item: RecipeListItem, contentFromCli: string): Promise<RecipeDetail> {
  // Prefer CLI-provided markdown, but also compute path for saving.
  let filePath: string | null = null;
  try {
    filePath = await resolveRecipePath(item);
  } catch {
    filePath = null;
  }
  return { ...item, content: contentFromCli, filePath };
}

export async function writeRecipeFile(filePath: string, md: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, md, "utf8");
}
