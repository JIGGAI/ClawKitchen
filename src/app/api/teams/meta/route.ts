import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { readOpenClawConfig } from "@/lib/paths";

function teamDirFromTeamId(baseWorkspace: string, teamId: string) {
  return path.resolve(baseWorkspace, "..", `workspace-${teamId}`);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamId = String(searchParams.get("teamId") ?? "").trim();
  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });

  const cfg = await readOpenClawConfig();
  const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
  if (!baseWorkspace) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
  }

  const teamDir = teamDirFromTeamId(baseWorkspace, teamId);
  const metaPath = path.join(teamDir, "team.json");

  try {
    const raw = await fs.readFile(metaPath, "utf8");
    const meta = JSON.parse(raw) as Record<string, unknown>;
    return NextResponse.json({ ok: true, teamId, teamDir, metaPath, meta });
  } catch {
    return NextResponse.json({ ok: true, teamId, teamDir, metaPath, meta: null, missing: true });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as { teamId?: string; recipeId?: string; recipeName?: string };
  const teamId = String(body.teamId ?? "").trim();
  const recipeId = String(body.recipeId ?? "").trim();
  const recipeName = typeof body.recipeName === "string" ? body.recipeName : "";

  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });
  if (!recipeId) return NextResponse.json({ ok: false, error: "recipeId is required" }, { status: 400 });

  const cfg = await readOpenClawConfig();
  const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
  if (!baseWorkspace) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
  }

  const teamDir = teamDirFromTeamId(baseWorkspace, teamId);
  const metaPath = path.join(teamDir, "team.json");

  const meta = {
    teamId,
    recipeId,
    recipeName,
    attachedAt: new Date().toISOString(),
  };

  await fs.mkdir(teamDir, { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");

  return NextResponse.json({ ok: true, teamId, teamDir, metaPath, meta });
}
