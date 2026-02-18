import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { readOpenClawConfig, teamDirFromBaseWorkspace, assertSafeRelativeFileName } from "@/lib/paths";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamId = String(searchParams.get("teamId") ?? "").trim();
  const name = String(searchParams.get("name") ?? "").trim();
  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });

  const cfg = await readOpenClawConfig();
  const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
  if (!baseWorkspace) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
  }

  const safe = assertSafeRelativeFileName(name);
  const teamDir = teamDirFromBaseWorkspace(baseWorkspace, teamId);
  const filePath = path.join(teamDir, safe);

  try {
    const content = await fs.readFile(filePath, "utf8");
    return NextResponse.json({ ok: true, teamId, name: safe, filePath, content });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(e) },
      { status: 404 }
    );
  }
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { teamId?: string; name?: string; content?: string };
  const teamId = String(body.teamId ?? "").trim();
  const name = String(body.name ?? "").trim();
  const content = typeof body.content === "string" ? body.content : null;

  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  if (content === null) return NextResponse.json({ ok: false, error: "content is required" }, { status: 400 });

  const cfg = await readOpenClawConfig();
  const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
  if (!baseWorkspace) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
  }

  const safe = assertSafeRelativeFileName(name);
  const teamDir = teamDirFromBaseWorkspace(baseWorkspace, teamId);
  const filePath = path.join(teamDir, safe);

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return NextResponse.json({ ok: true, teamId, name: safe, filePath });
}
