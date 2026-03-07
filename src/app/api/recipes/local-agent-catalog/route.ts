import { NextResponse } from "next/server";
import YAML from "yaml";
import { runOpenClaw } from "@/lib/openclaw";
import type { RecipeListItem } from "@/lib/recipes";
import { splitRecipeFrontmatter } from "@/lib/recipe-team-agents";

export const dynamic = "force-dynamic";

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

export async function GET() {
  const listRes = await runOpenClaw(["recipes", "list"]);
  if (!listRes.ok) {
    return NextResponse.json({ ok: false, error: listRes.stderr || "Failed to list recipes" }, { status: 500 });
  }

  let recipes: RecipeListItem[] = [];
  try {
    recipes = JSON.parse(listRes.stdout) as RecipeListItem[];
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse recipes list" }, { status: 500 });
  }

  const items: LocalAgentCatalogItem[] = [];

  // Only locally available recipes (builtin + workspace) are included by definition.
  for (const r of recipes) {
    if (!r?.id || (r.kind !== "team" && r.kind !== "agent")) continue;

    const showRes = await runOpenClaw(["recipes", "show", r.id]);
    if (!showRes.ok) continue;

    let fmRaw: unknown;
    try {
      fmRaw = parseRecipeFrontmatter(showRes.stdout);
    } catch {
      continue;
    }

    const fm = (fmRaw && typeof fmRaw === "object") ? (fmRaw as Record<string, unknown>) : {};

    const recipeName = String(fm["name"] ?? r.name ?? r.id).trim() || r.id;

    if (r.kind === "team") {
      const agents = Array.isArray(fm["agents"]) ? (fm["agents"] as unknown[]) : [];
      for (const aRaw of agents) {
        const a = (aRaw && typeof aRaw === "object") ? (aRaw as Record<string, unknown>) : {};
        const roleId = String(a["role"] ?? "").trim();
        if (!roleId) continue;
        const roleName = a["name"] ? String(a["name"]).trim() : "";
        items.push({
          kind: "team-role",
          recipeId: r.id,
          recipeName,
          roleId,
          roleName: roleName || undefined,
        });
      }
    }

    if (r.kind === "agent") {
      const description = fm["description"] ? String(fm["description"]).trim() : "";
      items.push({
        kind: "single-agent",
        recipeId: r.id,
        recipeName,
        description: description || undefined,
      });
    }
  }

  // Stable ordering: team roles first, then agents.
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "team-role" ? -1 : 1;
    const ar = a.recipeId.localeCompare(b.recipeId);
    if (ar) return ar;
    if (a.kind === "team-role" && b.kind === "team-role") return a.roleId.localeCompare(b.roleId);
    return 0;
  });

  return NextResponse.json({ ok: true, items });
}
