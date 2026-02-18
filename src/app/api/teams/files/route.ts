import { NextResponse } from "next/server";
import { getTeamContextFromQuery, listWorkspaceFiles } from "@/lib/api-route-helpers";

const TEAM_FILE_CANDIDATES = [
  { name: "TEAM.md", required: true, rationale: "Team workspace overview" },
  { name: "TICKETS.md", required: true, rationale: "Ticket workflow + format" },
  { name: "notes/QA_CHECKLIST.md", required: true, rationale: "QA verification checklist" },
  { name: "SOUL.md", required: false, rationale: "Optional team persona (some teams use role SOUL.md only)" },
  { name: "USER.md", required: false, rationale: "Optional user profile" },
  { name: "AGENTS.md", required: false, rationale: "Optional team notes (often role-scoped)" },
  { name: "TOOLS.md", required: false, rationale: "Optional team-local tooling notes" },
  { name: "MEMORY.md", required: false, rationale: "Optional curated memory" },
];

export async function GET(req: Request) {
  const ctx = await getTeamContextFromQuery(req);
  if (ctx instanceof NextResponse) return ctx;
  const { teamId, teamDir } = ctx;

  const files = await listWorkspaceFiles(teamDir, TEAM_FILE_CANDIDATES);
  return NextResponse.json({ ok: true, teamId, teamDir, files });
}
