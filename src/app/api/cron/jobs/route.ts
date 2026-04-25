import { NextResponse } from "next/server";
import { cachedRunOpenClaw } from "@/lib/openclaw-cache";
import { readOpenClawConfig } from "@/lib/paths";
import { errorMessage } from "@/lib/errors";
import { buildIdToScopeMap, enrichJobsWithScope } from "../helpers";
import {
  aggregateAllTeamCronJobs,
  getTeamCronJobs,
  refreshTeamCronCache,
} from "@/lib/team-cron-cache";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = String(url.searchParams.get("teamId") ?? "").trim();
    const force = url.searchParams.get("refresh") === "1";

    if (teamId) {
      // Per-team: serve the materialized cache file (~ms). Falls back to a
      // refresh on cache miss; mutation routes pre-warm via
      // refreshAllTeamCronCaches() so this miss only happens on first load.
      const payload = force ? await refreshTeamCronCache(teamId) : await getTeamCronJobs(teamId);
      return NextResponse.json({
        ok: true,
        jobs: payload.jobs,
        teamId,
        provenancePath: payload.provenancePath,
        installedIds: payload.installedIds,
        cachedAt: payload.cachedAt,
      });
    }

    // Global view: aggregate per-team caches first (fast path), then top up
    // with un-team-scoped jobs (e.g. agent-only crons not installed by a
    // team) via the in-memory cache.
    const aggregate = await aggregateAllTeamCronJobs();
    const seen = new Set<string>(
      aggregate.jobs.map((j) => String((j as { id?: unknown }).id ?? "")).filter(Boolean)
    );

    const res = await cachedRunOpenClaw(["cron", "list", "--all", "--json"]);
    if (!res.ok) {
      // If the global list call fails but we have any cached team data, return it.
      if (aggregate.jobs.length) return NextResponse.json({ ok: true, jobs: aggregate.jobs });
      return NextResponse.json({ ok: false, error: res.stderr || res.stdout }, { status: 500 });
    }
    const parsed = JSON.parse(String(res.stdout || "{}")) as { jobs?: unknown[] };
    const allJobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];

    const baseWorkspace = String(
      (await readOpenClawConfig()).agents?.defaults?.workspace ?? ""
    ).trim();
    const idToScope = baseWorkspace ? await buildIdToScopeMap(baseWorkspace) : new Map();

    const extras = allJobs.filter((j) => {
      const id = String((j as { id?: unknown }).id ?? "");
      return id && !seen.has(id);
    });
    const enrichedExtras = enrichJobsWithScope(extras, idToScope);

    return NextResponse.json({ ok: true, jobs: [...aggregate.jobs, ...enrichedExtras] });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
