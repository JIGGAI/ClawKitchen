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

  const candidates = [
    "SOUL.md",
    "USER.md",
    "TEAM.md",
    "TICKETS.md",
    "AGENTS.md",
    "MEMORY.md",
    "TOOLS.md",
    "notes/QA_CHECKLIST.md",
  ];

  const files = await Promise.all(
    candidates.map(async (name) => {
      const p = path.join(teamDir, name);
      try {
        const st = await fs.stat(p);
        return { name, path: p, missing: false, size: st.size, updatedAtMs: st.mtimeMs };
      } catch {
        return { name, path: p, missing: true };
      }
    })
  );

  return NextResponse.json({ ok: true, teamId, teamDir, files });
}
