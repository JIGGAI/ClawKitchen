import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { teamWorkspace } from "@/lib/tickets";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamId = (searchParams.get("team") ?? searchParams.get("teamId") ?? "").trim();
  if (!teamId) {
    return NextResponse.json({ assignees: [], error: "Missing ?team= parameter" }, { status: 400 });
  }

  const teamDir = teamId.includes("/") ? teamId : teamWorkspace(teamId);
  const rolesDir = path.join(teamDir, "roles");

  let entries: string[] = [];
  try {
    entries = await fs.readdir(rolesDir);
  } catch {
    entries = [];
  }

  const assignees = entries
    .filter((e) => !e.startsWith("."))
    .sort();

  return NextResponse.json({ assignees });
}
