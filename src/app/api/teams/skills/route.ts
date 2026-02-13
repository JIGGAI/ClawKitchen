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
  const skillsDir = path.join(teamDir, "skills");

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skills = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ ok: true, teamId, skillsDir, skills });
  } catch (e: unknown) {
    // skills dir may not exist
    return NextResponse.json({ ok: true, teamId, skillsDir, skills: [], note: e instanceof Error ? e.message : String(e) });
  }
}
