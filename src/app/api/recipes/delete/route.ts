import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { resolveRecipePath, type RecipeListItem } from "@/lib/recipes";
import fs from "node:fs/promises";
import path from "node:path";

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string };
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  // Look up recipe source/path.
  const list = await runOpenClaw(["recipes", "list"]);
  if (!list.ok) {
    return NextResponse.json({ ok: false, error: list.stderr.trim() || "Failed to list recipes" }, { status: 500 });
  }

  let recipes: RecipeListItem[] = [];
  try {
    recipes = JSON.parse(list.stdout) as RecipeListItem[];
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse recipes list" }, { status: 500 });
  }

  const item = recipes.find((r) => r.id === id);
  if (!item) return NextResponse.json({ ok: false, error: `Recipe not found: ${id}` }, { status: 404 });
  if (item.source === "builtin") {
    return NextResponse.json({ ok: false, error: `Recipe ${id} is builtin and cannot be deleted` }, { status: 403 });
  }

  // Safety: only allow deleting files inside the workspace recipes directory.
  const workspaceRoot = (await runOpenClaw(["config", "get", "agents.defaults.workspace"]))?.stdout?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace is not set" }, { status: 500 });
  }
  const allowedDir = path.resolve(workspaceRoot, "recipes") + path.sep;

  const filePath = await resolveRecipePath(item);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(allowedDir)) {
    return NextResponse.json({ ok: false, error: `Refusing to delete non-workspace recipe path: ${resolved}` }, { status: 403 });
  }

  // Block deletion if this is a team recipe and the team appears installed.
  if ((item.kind ?? "team") === "team") {
    const teamId = id;
    const teamDir = path.resolve(workspaceRoot, "..", `workspace-${teamId}`);
    const hasWorkspace = await fs
      .stat(teamDir)
      .then(() => true)
      .catch(() => false);

    // Agents check (prefix match)
    const agentsRes = await runOpenClaw(["agents", "list", "--json"]);
    let hasAgents = false;
    if (agentsRes.ok) {
      try {
        const agents = JSON.parse(agentsRes.stdout) as Array<{ id?: string }>;
        hasAgents = agents.some((a) => String(a.id ?? "").startsWith(`${teamId}-`));
      } catch {
        // ignore
      }
    }

    if (hasWorkspace || hasAgents) {
      return NextResponse.json(
        {
          ok: false,
          error: `Team appears installed for ${teamId}. Remove the team first, then delete the recipe.`,
          details: { hasWorkspace, hasAgents, teamDir },
        },
        { status: 409 },
      );
    }
  }

  await fs.rm(resolved, { force: true });
  return NextResponse.json({ ok: true, deleted: resolved });
}
