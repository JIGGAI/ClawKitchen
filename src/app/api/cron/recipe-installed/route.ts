import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { toolsInvoke } from "@/lib/gateway";

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
  const result = await toolsInvoke<{ content: Array<{ type: string; text?: string }> }>({
    tool: "gateway",
    args: { action: "config.get", raw: "{}" },
  });
  const cfgText = result?.content?.find((c) => c.type === "text")?.text ?? "";
  if (!cfgText) {
    return NextResponse.json({ ok: false, error: "Failed to fetch config via gateway" }, { status: 500 });
  }
  const env = JSON.parse(cfgText) as { result?: { raw?: string } };
  const raw = String(env.result?.raw ?? "");
  const parsedRaw = raw ? (JSON.parse(raw) as { agents?: { defaults?: { workspace?: string } } }) : null;
  const baseWorkspace = String(parsedRaw?.agents?.defaults?.workspace ?? "").trim();
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

  const parsed = (await toolsInvoke<{ jobs: unknown[] }>({
    tool: "cron",
    args: { action: "list", includeDisabled: true },
  })) as { jobs: unknown[] };
  const jobs = (parsed.jobs ?? []).filter((j) => ids.has(String((j as { id?: unknown })?.id ?? "")));

  return NextResponse.json({ ok: true, teamId, teamDir, mappingPath, jobCount: jobs.length, jobs });
}
