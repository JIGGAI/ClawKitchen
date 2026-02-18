import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveAgentWorkspace } from "@/lib/agents";
import { errorMessage } from "@/lib/errors";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agentId = String(searchParams.get("agentId") ?? "").trim();
  if (!agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });

  const ws = await resolveAgentWorkspace(agentId);
  const skillsDir = path.join(ws, "skills");

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skills = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ ok: true, agentId, workspace: ws, skillsDir, skills });
  } catch (e: unknown) {
    return NextResponse.json({ ok: true, agentId, workspace: ws, skillsDir, skills: [], note: errorMessage(e) });
  }
}
