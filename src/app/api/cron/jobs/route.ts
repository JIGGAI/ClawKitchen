import path from "node:path";
import { NextResponse } from "next/server";
import { toolsInvoke } from "@/lib/gateway";
import { runOpenClaw } from "@/lib/openclaw";
import { readOpenClawConfig, getTeamWorkspaceDir } from "@/lib/paths";
import { errorMessage } from "@/lib/errors";
import { buildIdToScopeMap, getInstalledIdsForTeam, enrichJobsWithScope } from "../helpers";

type CronToolResult = { content: Array<{ type: string; text?: string }> };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = String(url.searchParams.get("teamId") ?? "").trim();
    const res = await runOpenClaw(["cron", "list", "--all", "--json"]);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.stderr || res.stdout }, { status: 500 });
    }

    const parsed = JSON.parse(String(res.stdout || "{}")) as { jobs?: unknown[] };
    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];

    const baseWorkspace = String((await readOpenClawConfig()).agents?.defaults?.workspace ?? "").trim();
    const idToScope = baseWorkspace ? await buildIdToScopeMap(baseWorkspace) : new Map();
    const enriched = enrichJobsWithScope(jobs, idToScope);

    if (!teamId) return NextResponse.json({ ok: true, jobs: enriched });

    const teamDir = await getTeamWorkspaceDir(teamId);
    const provenancePath = path.join(teamDir, "notes", "cron-jobs.json");
    const installedIds = await getInstalledIdsForTeam(provenancePath);
    const filtered = enriched.filter((j) => installedIds.includes(String((j as { id?: unknown }).id ?? "")));

    return NextResponse.json({ ok: true, jobs: filtered, teamId, provenancePath, installedIds });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
