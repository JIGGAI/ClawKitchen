import fs from "node:fs/promises";
import path from "node:path";
import { cachedRunOpenClaw } from "@/lib/openclaw-cache";
import { getTeamWorkspaceDir, readOpenClawConfig } from "@/lib/paths";
import {
  buildIdToScopeMap,
  enrichJobsWithScope,
  getInstalledIdsForTeam,
} from "@/app/api/cron/helpers";

// Per-team cron list cache, materialized to disk. The /api/cron/jobs?teamId=X
// route reads from this file (~1ms) instead of paying the ~6s shell-out for
// `openclaw cron list --all --json` on every page render. After a cron
// mutation (add/remove/enable/disable/run/reconcile), mutation routes call
// `refreshAllTeamCronCaches()` (fire-and-forget) so caches are warm before
// the user's next page load.

const CACHE_FILE = "cron-jobs-cache.json";

export type TeamCronCachePayload = {
  version: 1;
  cachedAt: string;
  teamId: string;
  jobs: unknown[];
  installedIds: string[];
  provenancePath: string;
};

async function cachePathFor(teamId: string): Promise<string> {
  const dir = await getTeamWorkspaceDir(teamId);
  return path.join(dir, "notes", CACHE_FILE);
}

export async function readTeamCronCache(teamId: string): Promise<TeamCronCachePayload | null> {
  try {
    const p = await cachePathFor(teamId);
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as TeamCronCachePayload;
    if (parsed.version !== 1 || parsed.teamId !== teamId) return null;
    return parsed;
  } catch {
    return null;
  }
}

const inflight = new Map<string, Promise<TeamCronCachePayload>>();

/**
 * Re-read provenance + shell out for the full cron list, filter to this team,
 * enrich, and write the cache file. Concurrent callers for the same team share
 * one in-flight refresh.
 */
export async function refreshTeamCronCache(teamId: string): Promise<TeamCronCachePayload> {
  const existing = inflight.get(teamId);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const teamDir = await getTeamWorkspaceDir(teamId);
      const provenancePath = path.join(teamDir, "notes", "cron-jobs.json");
      const installedIds = await getInstalledIdsForTeam(provenancePath);

      const res = await cachedRunOpenClaw(["cron", "list", "--all", "--json"]);
      // If the subprocess failed, refuse to overwrite the cache. Old data is
      // better than serving an empty list. Caller falls back to whatever's
      // already on disk; first-call cold path just propagates the failure.
      if (!res.ok) {
        const existing = await readTeamCronCache(teamId);
        if (existing) return existing;
        throw new Error(`cron list failed: ${res.stderr || res.stdout}`);
      }

      const parsed = JSON.parse(String(res.stdout || "{}")) as { jobs?: unknown[] };
      const allJobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
      const filtered = allJobs.filter((j) =>
        installedIds.includes(String((j as { id?: unknown }).id ?? ""))
      );

      // Subprocess succeeded but returned 0 matches despite this team having
      // installed crons in its provenance. That's almost always a transient
      // failure (e.g. cron daemon mid-restart) — preserve previous cache so
      // users don't see a phantom-empty list.
      if (installedIds.length > 0 && filtered.length === 0) {
        const existing = await readTeamCronCache(teamId);
        if (existing) return existing;
        // No prior cache and no matches — could be a real "fresh install with
        // stale provenance" case. Continue and write [].
      }

      const baseWorkspace = String(
        (await readOpenClawConfig()).agents?.defaults?.workspace ?? ""
      ).trim();
      const jobs: unknown[] =
        baseWorkspace && filtered.length
          ? enrichJobsWithScope(filtered, await buildIdToScopeMap(baseWorkspace))
          : filtered;

      const payload: TeamCronCachePayload = {
        version: 1,
        cachedAt: new Date().toISOString(),
        teamId,
        jobs,
        installedIds,
        provenancePath,
      };
      const p = await cachePathFor(teamId);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, JSON.stringify(payload, null, 2), "utf8");
      return payload;
    } finally {
      inflight.delete(teamId);
    }
  })();
  inflight.set(teamId, promise);
  return promise;
}

/** Read cache; if missing, refresh + write. */
export async function getTeamCronJobs(teamId: string): Promise<TeamCronCachePayload> {
  const cached = await readTeamCronCache(teamId);
  if (cached) return cached;
  return refreshTeamCronCache(teamId);
}

async function listAllTeamIds(): Promise<string[]> {
  try {
    const baseWorkspace = String(
      (await readOpenClawConfig()).agents?.defaults?.workspace ?? ""
    ).trim();
    if (!baseWorkspace) return [];
    const baseHome = path.resolve(baseWorkspace, "..");
    const entries = await fs.readdir(baseHome, { withFileTypes: true });
    const ids: string[] = [];
    for (const ent of entries) {
      if (!ent.isDirectory() || !ent.name.startsWith("workspace-")) continue;
      const teamJsonPath = path.join(baseHome, ent.name, "team.json");
      try {
        await fs.stat(teamJsonPath);
      } catch {
        continue;
      }
      ids.push(ent.name.replace(/^workspace-/, ""));
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * Refresh every team's cron cache. Used by cron mutation routes after success
 * so the next page load reads warm caches. Fire-and-forget — callers should
 * NOT await; failures are swallowed.
 *
 * Each refresh shares the underlying `cron list --all --json` subprocess via
 * `cachedRunOpenClaw`, so refreshing N teams costs ~one subprocess call total.
 */
export async function refreshAllTeamCronCaches(): Promise<void> {
  const ids = await listAllTeamIds();
  await Promise.all(ids.map((id) => refreshTeamCronCache(id).catch(() => {})));
}

/** Read every team's cache, concatenating jobs. Used by the global /cron-jobs page. */
export async function aggregateAllTeamCronJobs(): Promise<{ jobs: unknown[]; missing: string[] }> {
  const ids = await listAllTeamIds();
  const results = await Promise.all(
    ids.map(async (id) => {
      const cached = await readTeamCronCache(id);
      return { id, cached };
    })
  );
  const jobs: unknown[] = [];
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const { id, cached } of results) {
    if (!cached) {
      missing.push(id);
      continue;
    }
    for (const j of cached.jobs) {
      const jobId = String((j as { id?: unknown }).id ?? "");
      if (jobId && !seen.has(jobId)) {
        seen.add(jobId);
        jobs.push(j);
      }
    }
  }
  return { jobs, missing };
}
