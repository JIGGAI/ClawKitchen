import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";

type MappingStateV1 = {
  version: 1;
  entries: Record<string, { installedCronId: string; orphaned?: boolean }>;
};

async function readJson<T>(p: string): Promise<T> {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw) as T;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const teamId = String(url.searchParams.get("teamId") ?? "").trim();
  if (!teamId) {
    return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });
  }

  // Team workspace root is a sibling of agents.defaults.workspace: ~/.openclaw/workspace-<teamId>
  const { stdout: wsOut } = await runOpenClaw(["config", "get", "agents.defaults.workspace"]);
  const baseWorkspace = wsOut.trim();
  if (!baseWorkspace) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
  }
  const teamDir = path.resolve(baseWorkspace, "..", `workspace-${teamId}`);
  const mappingPath = path.join(teamDir, "notes", "cron-jobs.json");

  let mapping: MappingStateV1 | null = null;
  try {
    mapping = await readJson<MappingStateV1>(mappingPath);
  } catch {
    // no mapping (yet)
    mapping = null;
  }

  const ids = new Set(
    Object.values(mapping?.entries ?? {})
      .filter((e) => e && typeof e.installedCronId === "string" && !e.orphaned)
      .map((e) => e.installedCronId)
  );

  const { stdout } = await runOpenClaw(["cron", "list", "--all", "--json"]);
  const parsed = JSON.parse(stdout) as { jobs: unknown[] };
  const jobs = (parsed.jobs ?? []).filter((j) => ids.has(String((j as { id?: unknown })?.id ?? "")));

  return NextResponse.json({ ok: true, teamId, teamDir, mappingPath, jobCount: jobs.length, jobs });
}
