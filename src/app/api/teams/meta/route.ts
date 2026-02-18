import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getTeamContextFromBody, getTeamContextFromQuery } from "@/lib/api-route-helpers";

export async function GET(req: Request) {
  const ctx = await getTeamContextFromQuery(req);
  if (ctx instanceof NextResponse) return ctx;
  const { teamId, teamDir } = ctx;
  const metaPath = path.join(teamDir, "team.json");

  try {
    const raw = await fs.readFile(metaPath, "utf8");
    const meta = JSON.parse(raw) as Record<string, unknown>;
    return NextResponse.json({ ok: true, teamId, teamDir, metaPath, meta });
  } catch {
    return NextResponse.json({ ok: true, teamId, teamDir, metaPath, meta: null, missing: true });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as { teamId?: string; recipeId?: string; recipeName?: string };
  const ctx = await getTeamContextFromBody(body);
  if (ctx instanceof NextResponse) return ctx;
  const { teamId, teamDir } = ctx;

  const recipeId = String(body.recipeId ?? "").trim();
  const recipeName = typeof body.recipeName === "string" ? body.recipeName : "";
  if (!recipeId) return NextResponse.json({ ok: false, error: "recipeId is required" }, { status: 400 });

  const metaPath = path.join(teamDir, "team.json");

  const meta = {
    teamId,
    recipeId,
    recipeName,
    attachedAt: new Date().toISOString(),
  };

  await fs.mkdir(teamDir, { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");

  return NextResponse.json({ ok: true, teamId, teamDir, metaPath, meta });
}
