import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

export async function GET() {
  const home = os.homedir();
  const globalSkillsDir = path.join(home, ".openclaw", "skills");

  try {
    const entries = await fs.readdir(globalSkillsDir, { withFileTypes: true });
    const skills = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ ok: true, skillsDir: globalSkillsDir, skills });
  } catch (e: unknown) {
    // If missing, treat as empty.
    return NextResponse.json({ ok: true, skillsDir: globalSkillsDir, skills: [], note: e instanceof Error ? e.message : String(e) });
  }
}
