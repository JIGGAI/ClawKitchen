import path from "node:path";
import { NextResponse } from "next/server";
import { cachedRunOpenClaw } from "@/lib/openclaw-cache";
import { readOpenClawConfig, getTeamWorkspaceDir } from "@/lib/paths";
import { errorMessage } from "@/lib/errors";
import { buildIdToScopeMap, getInstalledIdsForTeam, enrichJobsWithScope } from "../helpers";


export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = String(url.searchParams.get("teamId") ?? "").trim();
    // 15s TTL: `cron list --all --json` takes ~6s. Mutation routes
    // (cron rm/enable/disable/run) call invalidateOpenClawCache(["cron"])
    // after success so users see their changes immediately.
    const res = await cachedRunOpenClaw(["cron", "list", "--all", "--json"], { ttlMs: 15_000 });
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
