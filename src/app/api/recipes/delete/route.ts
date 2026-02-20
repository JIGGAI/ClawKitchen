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

  const kind = (item.kind ?? "team") as "team" | "agent";

  // Block deletion if this recipe appears in use.
  if (kind === "team") {
    // A team recipe can scaffold many teams with different teamIds.
    // We treat any workspace-*/team.json referencing this recipe as "in use".
    const teamsRoot = path.resolve(workspaceRoot, "..");
    const attachedTeams: string[] = [];

    try {
      const entries = await fs.readdir(teamsRoot, { withFileTypes: true });
      const workspaceDirs = entries.filter((e) => e.isDirectory() && e.name.startsWith("workspace-"));
      for (const dirent of workspaceDirs) {
        const metaPath = path.join(teamsRoot, dirent.name, "team.json");
        try {
          const raw = await fs.readFile(metaPath, "utf8");
          const meta = JSON.parse(raw) as { recipeId?: unknown; teamId?: unknown };
          if (String(meta.recipeId ?? "").trim() === id) {
            attachedTeams.push(String(meta.teamId ?? dirent.name.replace(/^workspace-/, "")).trim() || dirent.name);
          }
        } catch {
          // ignore missing/unparseable
        }
      }
    } catch {
      // ignore
    }

    if (attachedTeams.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Team ${id} is in use by installed team(s): ${attachedTeams.join(", ")}. Remove the team(s) first, then delete the recipe. If no team is shown, you still have a .openclaw/workspace-${id} folder. Please remove the folder to delete this recipe.`, 
          details: { attachedTeams },
        },
        { status: 409 },
      );
    }
  }

  if (kind === "agent") {
    // Agent recipes can scaffold many agents with different agentIds.
    // We treat any agents/<agentId>/agent.json referencing this recipe as "in use".
    // Additionally, if an active agent exists with the SAME id as the recipe, we must block deletion
    // (older installs may not have agent.json provenance yet).
    const agentsRes = await runOpenClaw(["agents", "list", "--json"]);
    const attachedAgents: string[] = [];
    let hasSameIdAgent = false;

    if (agentsRes.ok) {
      try {
        const agents = JSON.parse(agentsRes.stdout) as Array<{ id?: unknown }>;
        hasSameIdAgent = agents.some((a) => String(a.id ?? "").trim() === id);

        for (const a of agents) {
          const agentId = String(a.id ?? "").trim();
          if (!agentId) continue;
          const metaPath = path.join(workspaceRoot, "agents", agentId, "agent.json");
          try {
            const raw = await fs.readFile(metaPath, "utf8");
            const meta = JSON.parse(raw) as { recipeId?: unknown };
            if (String(meta.recipeId ?? "").trim() === id) attachedAgents.push(agentId);
          } catch {
            // ignore missing/unparseable
          }
        }
      } catch {
        // ignore
      }
    }

    if (hasSameIdAgent) {
      return NextResponse.json(
        {
          ok: false,
          error: `Agent recipe ${id} cannot be deleted because an active agent exists with the same id: ${id}. Delete the agent first, then delete the recipe.`,
          details: { agentId: id },
        },
        { status: 409 },
      );
    }

    if (attachedAgents.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Agent recipe ${id} is in use by active agent(s): ${attachedAgents.join(", ")}. Delete the agent(s) first, then delete the recipe.`,
          details: { attachedAgents },
        },
        { status: 409 },
      );
    }
  }

  await fs.rm(resolved, { force: true });
  return NextResponse.json({ ok: true, deleted: resolved });
}
