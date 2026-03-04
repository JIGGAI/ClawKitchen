import fs from "node:fs/promises";
import path from "node:path";
import { getTeamWorkspaceDir } from "@/lib/paths";
import { readdirFiles } from "@/lib/workflows/readdir";
import { assertSafeWorkflowId } from "@/lib/workflows/storage";
import type { WorkflowRunFileV1 } from "@/lib/workflows/runs-types";

const RUNS_DIR = path.join("shared-context", "workflow-runs");

export function assertSafeRunId(runId: string) {
  const id = String(runId ?? "").trim();
  if (!id) throw new Error("run id is required");
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(id)) {
    throw new Error("Invalid run id. Use lowercase letters, numbers, and dashes (max 81 chars).");
  }
  return id;
}

export async function getWorkflowRunsDir(teamId: string, workflowId: string) {
  const wfId = assertSafeWorkflowId(workflowId);
  const teamDir = await getTeamWorkspaceDir(teamId);
  return path.join(teamDir, RUNS_DIR, wfId);
}

export function workflowRunFileName(runId: string) {
  return `${runId}.run.json`;
}

export async function listWorkflowRuns(teamId: string, workflowId: string) {
  const dir = await getWorkflowRunsDir(teamId, workflowId);
  return readdirFiles(dir, ".run.json", true);
}

export async function readWorkflowRun(teamId: string, workflowId: string, runId: string) {
  const wfId = assertSafeWorkflowId(workflowId);
  const rId = assertSafeRunId(runId);
  const dir = await getWorkflowRunsDir(teamId, wfId);
  const p = path.join(dir, workflowRunFileName(rId));
  const raw = await fs.readFile(p, "utf8");
  const parsed = JSON.parse(raw) as WorkflowRunFileV1;
  return { ok: true as const, path: p, run: parsed };
}

export async function writeWorkflowRun(teamId: string, workflowId: string, run: WorkflowRunFileV1) {
  const wfId = assertSafeWorkflowId(workflowId);
  const rId = assertSafeRunId(run.id);
  const dir = await getWorkflowRunsDir(teamId, wfId);
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, workflowRunFileName(rId));
  const toWrite: WorkflowRunFileV1 = {
    ...run,
    schema: "clawkitchen.workflow-run.v1",
    id: rId,
    workflowId: wfId,
    teamId,
  };
  await fs.writeFile(p, JSON.stringify(toWrite, null, 2) + "\n", "utf8");
  return { ok: true as const, path: p };
}

export type WorkflowRunSummary = {
  workflowId: string;
  runId: string;
  status?: WorkflowRunFileV1["status"];
  startedAt?: string;
  endedAt?: string;
  /** ISO timestamp derived from file mtime (best-effort) */
  updatedAt?: string;
  /** Absolute path to the run file on disk (server-side only) */
  path: string;
};

export async function listAllWorkflowRuns(teamId: string): Promise<{ ok: true; dir: string; runs: WorkflowRunSummary[] }> {
  const teamDir = await getTeamWorkspaceDir(teamId);
  const dir = path.join(teamDir, RUNS_DIR);

  // Structure: shared-context/workflow-runs/<workflowId>/*.run.json
  let wfDirs: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    wfDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (err: unknown) {
    if (err && typeof err === "object" && (err as { code?: unknown }).code === "ENOENT") {
      return { ok: true as const, dir, runs: [] };
    }
    throw err;
  }

  const runs: WorkflowRunSummary[] = [];

  for (const workflowId of wfDirs) {
    const wfDir = path.join(dir, workflowId);
    let entries: string[] = [];
    try {
      entries = (await fs.readdir(wfDir)).filter((n) => n.endsWith(".run.json")).sort();
    } catch (err: unknown) {
      if (err && typeof err === "object" && (err as { code?: unknown }).code === "ENOENT") continue;
      throw err;
    }

    for (const fileName of entries) {
      const runId = fileName.replace(/\.run\.json$/i, "");
      const full = path.join(wfDir, fileName);
      try {
        const [raw, st] = await Promise.all([fs.readFile(full, "utf8"), fs.stat(full)]);
        const parsed = JSON.parse(raw) as Partial<WorkflowRunFileV1>;
        runs.push({
          workflowId,
          runId,
          status: parsed.status as WorkflowRunFileV1["status"],
          startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : undefined,
          endedAt: typeof parsed.endedAt === "string" ? parsed.endedAt : undefined,
          updatedAt: st.mtime ? new Date(st.mtime).toISOString() : undefined,
          path: full,
        });
      } catch {
        // Ignore malformed/partial run files; don't break the whole page.
        runs.push({ workflowId, runId, path: full });
      }
    }
  }

  runs.sort((a, b) => String(b.updatedAt ?? b.startedAt ?? "").localeCompare(String(a.updatedAt ?? a.startedAt ?? "")));
  return { ok: true as const, dir, runs };
}
