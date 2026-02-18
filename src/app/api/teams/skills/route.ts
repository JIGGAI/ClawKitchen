import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { readOpenClawConfig, teamDirFromBaseWorkspace } from "@/lib/paths";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamId = String(searchParams.get("teamId") ?? "").trim();
  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });

  const cfg = await readOpenClawConfig();
  const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
  if (!baseWorkspace) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
  }

  const teamDir = teamDirFromBaseWorkspace(baseWorkspace, teamId);
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
    return NextResponse.json({ ok: true, teamId, skillsDir, skills: [], note: errorMessage(e) });
  }
}
