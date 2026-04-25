import { NextResponse } from "next/server";
import path from "node:path";
import { runOpenClaw } from "@/lib/openclaw";
import { invalidateOpenClawCache } from "@/lib/openclaw-cache";
import { findRecipeById, resolveRecipePath } from "@/lib/recipes";
import fs from "node:fs/promises";
import { getAttachedTeams, getAttachedAgents } from "./helpers";

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string };
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const item = await findRecipeById(id);
  if (!item) return NextResponse.json({ ok: false, error: `Recipe not found: ${id}` }, { status: 404 });
  if (item.source === "builtin") {
    return NextResponse.json({ ok: false, error: `Recipe ${id} is builtin and cannot be deleted` }, { status: 403 });
  }

  const workspaceRoot = (await runOpenClaw(["config", "get", "agents.defaults.workspace"]))?.stdout?.trim();
  if (!workspaceRoot) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
  }
  const allowedDir = path.resolve(workspaceRoot, "recipes") + path.sep;

  const filePath = await resolveRecipePath(item);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(allowedDir)) {
    return NextResponse.json({ ok: false, error: `Refusing to delete non-workspace recipe path: ${resolved}` }, { status: 403 });
  }

  const kind = (item.kind ?? "team") as "team" | "agent";

  if (kind === "team") {
    const attachedTeams = await getAttachedTeams(workspaceRoot, id);
    if (attachedTeams.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Team ${id} is in use by installed team(s): ${attachedTeams.join(", ")}. Remove the team(s) first, then delete the recipe. If no team is shown, you still have a .openclaw/workspace-${id} folder. Please remove the folder to delete this recipe.`,
          details: { attachedTeams },
        },
        { status: 409 }
      );
    }
  }

  if (kind === "agent") {
    const { attachedAgents, hasSameIdAgent } = await getAttachedAgents(workspaceRoot, id);
    if (hasSameIdAgent) {
      return NextResponse.json(
        {
          ok: false,
          error: `Agent recipe ${id} cannot be deleted because an active agent exists with the same id: ${id}. Delete the agent first, then delete the recipe.`,
          details: { agentId: id },
        },
        { status: 409 }
      );
    }
    if (attachedAgents.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Agent recipe ${id} is in use by active agent(s): ${attachedAgents.join(", ")}. Delete the agent(s) first, then delete the recipe.`,
          details: { attachedAgents },
        },
        { status: 409 }
      );
    }
  }

  await fs.rm(resolved, { force: true });
  // The deleted recipe must drop out of cached recipe lookups.
  invalidateOpenClawCache(["recipes", "list"], ["recipes", "show", id]);
  return NextResponse.json({ ok: true, deleted: resolved });
}
