import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { getTeamContextFromQuery } from "@/lib/api-route-helpers";

export async function GET(req: Request) {
  const ctx = await getTeamContextFromQuery(req);
  if (ctx instanceof NextResponse) return ctx;
  const { teamId, teamDir } = ctx;
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
