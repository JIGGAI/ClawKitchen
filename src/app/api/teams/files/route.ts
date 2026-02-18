import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
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

  const candidates: Array<{ name: string; required: boolean; rationale: string }> = [
    { name: "TEAM.md", required: true, rationale: "Team workspace overview" },
    { name: "TICKETS.md", required: true, rationale: "Ticket workflow + format" },
    { name: "notes/QA_CHECKLIST.md", required: true, rationale: "QA verification checklist" },

    { name: "SOUL.md", required: false, rationale: "Optional team persona (some teams use role SOUL.md only)" },
    { name: "USER.md", required: false, rationale: "Optional user profile" },
    { name: "AGENTS.md", required: false, rationale: "Optional team notes (often role-scoped)" },
    { name: "TOOLS.md", required: false, rationale: "Optional team-local tooling notes" },
    { name: "MEMORY.md", required: false, rationale: "Optional curated memory" },
  ];

  const files = await Promise.all(
    candidates.map(async (c) => {
      const p = path.join(teamDir, c.name);
      try {
        const st = await fs.stat(p);
        return {
          name: c.name,
          required: c.required,
          rationale: c.rationale,
          path: p,
          missing: false,
          size: st.size,
          updatedAtMs: st.mtimeMs,
        };
      } catch {
        return { name: c.name, required: c.required, rationale: c.rationale, path: p, missing: true };
      }
    })
  );

  return NextResponse.json({ ok: true, teamId, teamDir, files });
}
