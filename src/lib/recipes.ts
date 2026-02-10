import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { getBuiltinRecipesDir, getWorkspaceRecipesDir } from "./paths";

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
