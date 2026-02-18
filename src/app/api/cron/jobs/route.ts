import { NextResponse } from "next/server";
import { cronJobId } from "@/lib/cron";
import { errorMessage } from "@/lib/errors";
import { getContentText, toolsInvoke } from "@/lib/gateway";

type CronToolResult = {
  content: Array<{ type: string; text?: string }>;
};

import fs from "node:fs/promises";
import path from "node:path";
import { getTeamWorkspaceDir } from "@/lib/paths";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = String(url.searchParams.get("teamId") ?? "").trim();

    const result = await toolsInvoke<CronToolResult>({
      tool: "cron",
      args: { action: "list", includeDisabled: true },
    });

    const text = getContentText(result?.content);
    if (!text) {
      return NextResponse.json({ ok: true, jobs: [] });
    }

    const parsed = JSON.parse(text) as { jobs?: unknown[] };
    const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];

    if (!teamId) {
      return NextResponse.json({ ok: true, jobs });
    }

    // If a teamId is provided, filter to only cron jobs installed for that team.
    // Source of truth is the team workspace provenance file written by scaffold-team.
    const teamDir = await getTeamWorkspaceDir(teamId);
    const provenancePath = path.join(teamDir, "notes", "cron-jobs.json");

    let installedIds: string[] = [];
    try {
      const text = await fs.readFile(provenancePath, "utf8");
      const json = JSON.parse(text) as { entries?: Record<string, { installedCronId?: unknown; orphaned?: unknown }> };
      const entries = json.entries ?? {};
      installedIds = Object.values(entries)
        .filter((e) => !Boolean(e.orphaned))
        .map((e) => String(e.installedCronId ?? "").trim())
        .filter(Boolean);
    } catch {
      // If the file is missing, treat as no installed cron jobs.
      installedIds = [];
    }

    const filtered = jobs.filter((j) => installedIds.includes(cronJobId(j)));
    return NextResponse.json({ ok: true, jobs: filtered, teamId, provenancePath, installedIds });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
