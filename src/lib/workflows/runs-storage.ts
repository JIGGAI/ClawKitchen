import fs from "node:fs/promises";
import path from "node:path";
import { getTeamWorkspaceDir } from "@/lib/paths";
import { readdirFiles } from "@/lib/workflows/readdir";
import { assertSafeWorkflowId } from "@/lib/workflows/storage";
import type { WorkflowRunFileV1, WorkflowRunNodeResultV1 } from "@/lib/workflows/runs-types";

const RUNS_DIR = path.join("shared-context", "workflow-runs");

/**
 * Back-compat:
 * - Legacy Kitchen layout: shared-context/workflow-runs/<workflowId>/*.run.json
 * - Runner layout (preferred): shared-context/workflow-runs/*.run.json
 */
const LEGACY_PER_WORKFLOW_LAYOUT = true;

export function assertSafeRunId(runId: string) {
  const id = String(runId ?? "").trim();
  if (!id) throw new Error("run id is required");

  // Accept both Kitchen-style run ids (lowercase) and runner ids that include ISO timestamps (T/Z).
  // We still keep it conservative: only letters/numbers/dashes.
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,120}$/.test(id)) {
    throw new Error("Invalid run id. Use letters, numbers, and dashes."
    );
  }
  return id;
}

export async function getWorkflowRunsDir(teamId: string, workflowId: string) {
  // Validate workflowId (we no longer use it for the directory name).
  void assertSafeWorkflowId(workflowId);
  const teamDir = await getTeamWorkspaceDir(teamId);
  return path.join(teamDir, RUNS_DIR);
}

export function workflowRunFileName(runId: string) {
  return `${runId}.run.json`;
}

export async function listWorkflowRuns(teamId: string, workflowId: string) {
  const wfId = assertSafeWorkflowId(workflowId);
  const dir = await getWorkflowRunsDir(teamId, wfId);

  const runIds: string[] = [];

  // Preferred: runner directory-per-run layout: shared-context/workflow-runs/<runId>/run.json
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const runDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

    for (const runId of runDirs) {
      const p = path.join(dir, runId, "run.json");
      try {
        const raw = await fs.readFile(p, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        const runDir = path.join(dir, runId);
        const normalized = await normalizeRunFile(teamId, wfId, parsed, runId, runDir);
        if (normalized.workflowId === wfId) runIds.push(runId);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // Legacy: flat *.run.json at root
  try {
    const { files } = await readdirFiles(dir, ".run.json", true);
    for (const f of files) {
      const runId = f.replace(/\.run\.json$/i, "");
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf8");
        const parsed = JSON.parse(raw) as unknown;
        const normalized = await normalizeRunFile(teamId, wfId, parsed, runId);
        if (normalized.workflowId === wfId) runIds.push(runId);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // Back-compat: legacy per-workflow directory.
  if (LEGACY_PER_WORKFLOW_LAYOUT) {
    try {
      const legacyDir = path.join(dir, wfId);
      const { files } = await readdirFiles(legacyDir, ".run.json", true);
      for (const f of files) runIds.push(f.replace(/\.run\.json$/i, ""));
    } catch {
      // ignore
    }
  }

  const uniq = Array.from(new Set(runIds)).sort().reverse();
  return { ok: true as const, dir, runIds: uniq };
}

export async function readWorkflowRun(teamId: string, workflowId: string, runId: string) {
  const wfId = assertSafeWorkflowId(workflowId);
  const rId = assertSafeRunId(runId);
  const dir = await getWorkflowRunsDir(teamId, wfId);

  // Preferred (runner) layout: shared-context/workflow-runs/<runId>/run.json
  const pRunner = path.join(dir, rId, "run.json");
  try {
    const raw = await fs.readFile(pRunner, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const runDir = path.join(dir, rId);
    const run = await normalizeRunFile(teamId, wfId, parsed, rId, runDir);

    // Runner stores rich node outputs as files under:
    //   workflow-runs/<runId>/node-outputs/*-<nodeId>.json
    // Normalize by hydrating node.output from those files when missing.
    if (Array.isArray(run.nodes) && run.nodes.length) {
      const outputsDir = path.join(dir, rId, "node-outputs");
      let files: string[] = [];
      try {
        files = await fs.readdir(outputsDir);
      } catch {
        files = [];
      }

      // Multiple output files may exist for the same nodeId when a workflow executes a node
      // more than once. Preserve ordering by assigning outputs sequentially per nodeId.
      //
      // NOTE: Runner output filenames are typically prefixed with a sortable counter (e.g. 001-<nodeId>.json).
      // We rely on lexicographic order of filenames within node-outputs.
      const byNodeId = new Map<string, string[]>();
      for (const f of files.slice().sort()) {
        const m = f.match(/-([^/]+)\.json$/);
        if (!m) continue;
        const nodeId = m[1];
        if (!nodeId) continue;
        const existing = byNodeId.get(nodeId) ?? [];
        existing.push(path.join(outputsDir, f));
        byNodeId.set(nodeId, existing);
      }

      await Promise.all(
        run.nodes.map(async (n) => {
          if (!n || typeof n !== "object") return;
          // Only hydrate if output is truly missing.
          if (typeof n.output !== "undefined") return;

          const arr = byNodeId.get(n.nodeId);
          if (!arr || !arr.length) return;

          const pOut = arr.shift();
          if (!pOut) return;

          try {
            const outRaw = await fs.readFile(pOut, "utf8");
            n.output = JSON.parse(outRaw) as unknown;
          } catch {
            // ignore
          }
        })
      );
    }

    // Runner-managed runs have nodeStates and no schema field in the raw file.
    const isRunnerManaged = !!(parsed && typeof parsed === "object" && "nodeStates" in parsed && !("schema" in parsed));
    return { ok: true as const, path: pRunner, run, isRunnerManaged };
  } catch (err: unknown) {
    // fallthrough
    if (!(err && typeof err === "object" && (err as { code?: unknown }).code === "ENOENT")) throw err;
  }

  // Legacy flat layout: shared-context/workflow-runs/<runId>.run.json
  const p0 = path.join(dir, workflowRunFileName(rId));
  try {
    const raw = await fs.readFile(p0, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return { ok: true as const, path: p0, run: await normalizeRunFile(teamId, wfId, parsed, rId) };
  } catch (err: unknown) {
    if (LEGACY_PER_WORKFLOW_LAYOUT && err && typeof err === "object" && (err as { code?: unknown }).code === "ENOENT") {
      const legacy = path.join(dir, wfId, workflowRunFileName(rId));
      const raw = await fs.readFile(legacy, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return { ok: true as const, path: legacy, run: await normalizeRunFile(teamId, wfId, parsed, rId) };
    }
    throw err;
  }
}

export async function writeWorkflowRun(teamId: string, workflowId: string, run: WorkflowRunFileV1) {
  const wfId = assertSafeWorkflowId(workflowId);
  const rId = assertSafeRunId(run.id);
  const dir = await getWorkflowRunsDir(teamId, wfId);
  await fs.mkdir(dir, { recursive: true });

  // Phase 2: Unified format - write directly to ClawRecipes directory format
  // shared-context/workflow-runs/<runId>/run.json
  const runDir = path.join(dir, rId);
  const runPath = path.join(runDir, "run.json");

  // Create run directory if it doesn't exist
  await fs.mkdir(runDir, { recursive: true });

  // Check if ClawRecipes format file already exists
  let existingClawRecipesRun: Record<string, unknown> | null = null;
  try {
    const existingRaw = await fs.readFile(runPath, "utf8");
    existingClawRecipesRun = JSON.parse(existingRaw);
  } catch {
    // File doesn't exist or isn't parseable - will create new one
  }

  if (existingClawRecipesRun) {
    // Update existing ClawRecipes format run
    // Preserve important ClawRecipes fields like events, nodeStates, etc.
    const updatedRun = {
      ...existingClawRecipesRun,
      // Update status and timing from ClawKitchen format
      status: mapKitchenStatusToRecipes(run.status),
      updatedAt: new Date().toISOString(),
      // Merge node results if provided
      ...(run.nodes && { nodeResults: run.nodes }),
    };

    await fs.writeFile(runPath, JSON.stringify(updatedRun, null, 2) + "\n", "utf8");
    return { ok: true as const, path: runPath };
  } else {
    // Create new run in ClawRecipes format
    // Convert ClawKitchen format to ClawRecipes format
    const clawRecipesRun = {
      runId: rId,
      createdAt: run.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teamId,
      workflow: { 
        file: `${wfId}.workflow.json`,
        id: wfId,
        name: wfId // Use workflowId as name fallback
      },
      ticket: {
        file: `${rId}.md`, // Default ticket file pattern
        number: rId,
        lane: "in-progress" as const
      },
      trigger: { 
        kind: "manual",
        at: run.startedAt || new Date().toISOString()
      },
      status: mapKitchenStatusToRecipes(run.status),
      events: [] as Array<Record<string, unknown>>,
      nodeResults: run.nodes || [],
      nodeStates: {} as Record<string, Record<string, unknown>>
    };

    // Convert nodes to nodeStates
    if (run.nodes) {
      for (const node of run.nodes) {
        clawRecipesRun.nodeStates[node.nodeId] = {
          status: node.status === "success" ? "success" : node.status === "error" ? "error" : "waiting",
          ts: node.endedAt || node.startedAt || new Date().toISOString(),
          message: typeof node.output === "object" && node.output ? JSON.stringify(node.output) : undefined
        };
      }
    }

    await fs.writeFile(runPath, JSON.stringify(clawRecipesRun, null, 2) + "\n", "utf8");
    return { ok: true as const, path: runPath };
  }
}

// Helper function to map ClawKitchen status to ClawRecipes status
function mapKitchenStatusToRecipes(kitchenStatus: string): string {
  switch (kitchenStatus) {
    case "success":
      return "completed";
    case "canceled":
      return "canceled";
    case "error":
      return "error";
    case "waiting_for_approval":
      return "waiting";
    case "waiting_workers":
    case "running":
    case "queued":
      return "running";
    default:
      return kitchenStatus;
  }
}

// Helper function to append events to ClawRecipes run log
export async function appendWorkflowRunEvent(
  teamId: string, 
  workflowId: string, 
  runId: string, 
  event: { type: string; [key: string]: unknown }
) {
  const wfId = assertSafeWorkflowId(workflowId);
  const rId = assertSafeRunId(runId);
  const dir = await getWorkflowRunsDir(teamId, wfId);
  const runDir = path.join(dir, rId);
  const runPath = path.join(runDir, "run.json");

  try {
    const existingRaw = await fs.readFile(runPath, "utf8");
    const existingRun = JSON.parse(existingRaw);
    
    // Add timestamp to event
    const timestampedEvent = {
      ...event,
      ts: new Date().toISOString()
    };
    
    // Append event to events array
    if (!existingRun.events) {
      existingRun.events = [];
    }
    existingRun.events.push(timestampedEvent);
    existingRun.updatedAt = new Date().toISOString();

    await fs.writeFile(runPath, JSON.stringify(existingRun, null, 2) + "\n", "utf8");
    return { ok: true as const, path: runPath };
  } catch {
    // If file doesn't exist, we can't append an event
    throw new Error(`Cannot append event to non-existent run: ${runId}`);
  }
}

// Helper function to write approval files in ClawRecipes format
export async function writeApprovalFile(
  teamId: string,
  workflowId: string, 
  runId: string,
  nodeId: string,
  approvalData: {
    state: string;
    requestedAt?: string;
    decidedAt?: string;
    note?: string;
    decidedBy?: string;
  }
) {
  const wfId = assertSafeWorkflowId(workflowId);
  const rId = assertSafeRunId(runId);
  const dir = await getWorkflowRunsDir(teamId, wfId);
  const runDir = path.join(dir, rId);
  const approvalsDir = path.join(runDir, "approvals");
  const approvalPath = path.join(approvalsDir, "approval.json");

  // Create approvals directory if it doesn't exist
  await fs.mkdir(approvalsDir, { recursive: true });

  // Write approval file in ClawRecipes format
  const approvalFile = {
    nodeId,
    state: approvalData.state,
    requestedAt: approvalData.requestedAt || new Date().toISOString(),
    decidedAt: approvalData.decidedAt,
    note: approvalData.note,
    decidedBy: approvalData.decidedBy
  };

  await fs.writeFile(approvalPath, JSON.stringify(approvalFile, null, 2) + "\n", "utf8");
  return { ok: true as const, path: approvalPath };
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

  const runs: WorkflowRunSummary[] = [];

  // Preferred: runner directory-per-run layout:
  //   shared-context/workflow-runs/<runId>/run.json
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const runDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

    for (const runId of runDirs) {
      const full = path.join(dir, runId, "run.json");
      try {
        const [raw, st] = await Promise.all([fs.readFile(full, "utf8"), fs.stat(full)]);
        const runDir = path.join(dir, runId);
        const normalized = await normalizeRunFile(teamId, "(unknown)", JSON.parse(raw) as unknown, runId, runDir);
        runs.push({
          workflowId: normalized.workflowId,
          runId: normalized.id,
          status: normalized.status,
          startedAt: normalized.startedAt,
          endedAt: normalized.endedAt,
          updatedAt: st.mtime ? new Date(st.mtime).toISOString() : undefined,
          path: full,
        });
      } catch {
        // ignore missing run.json/parse errors; keep going
      }
    }
  } catch (err: unknown) {
    if (!(err && typeof err === "object" && (err as { code?: unknown }).code === "ENOENT")) throw err;
  }

  // Legacy: flat run files at root: shared-context/workflow-runs/<runId>.run.json
  try {
    const entries = (await fs.readdir(dir)).filter((n) => n.endsWith(".run.json")).sort();
    for (const fileName of entries) {
      const runId = fileName.replace(/\.run\.json$/i, "");
      const full = path.join(dir, fileName);
      try {
        const [raw, st] = await Promise.all([fs.readFile(full, "utf8"), fs.stat(full)]);
        const normalized = await normalizeRunFile(teamId, "(unknown)", JSON.parse(raw) as unknown, runId);
        runs.push({
          workflowId: normalized.workflowId,
          runId: normalized.id,
          status: normalized.status,
          startedAt: normalized.startedAt,
          endedAt: normalized.endedAt,
          updatedAt: st.mtime ? new Date(st.mtime).toISOString() : undefined,
          path: full,
        });
      } catch {
        runs.push({ workflowId: "(unknown)", runId, path: full });
      }
    }
  } catch (err: unknown) {
    if (!(err && typeof err === "object" && (err as { code?: unknown }).code === "ENOENT")) throw err;
  }

  // Back-compat: legacy per-workflow directory.
  if (LEGACY_PER_WORKFLOW_LAYOUT) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const wfDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

      for (const workflowId of wfDirs) {
        const wfDir = path.join(dir, workflowId);
        let entries2: string[] = [];
        try {
          entries2 = (await fs.readdir(wfDir)).filter((n) => n.endsWith(".run.json")).sort();
        } catch (err: unknown) {
          if (err && typeof err === "object" && (err as { code?: unknown }).code === "ENOENT") continue;
          throw err;
        }

        for (const fileName of entries2) {
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
            runs.push({ workflowId, runId, path: full });
          }
        }
      }
    } catch (err: unknown) {
      if (!(err && typeof err === "object" && (err as { code?: unknown }).code === "ENOENT")) throw err;
    }
  }

  // Deduplicate across layouts. It's possible for the same logical run to appear in multiple places
  // (runner dir-per-run + legacy flat/per-workflow layouts). Prefer the richest record.
  const byKey = new Map<string, WorkflowRunSummary>();
  for (const r of runs) {
    const key = `${r.workflowId}:${r.runId}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }

    const score = (x: WorkflowRunSummary) => {
      let s = 0;
      if (x.status) s += 2;
      if (x.startedAt) s += 1;
      if (x.endedAt) s += 1;
      if (x.updatedAt) s += 1;
      // Prefer runner dir-per-run run.json over legacy .run.json files.
      if (x.path.endsWith(`${path.sep}run.json`)) s += 2;
      return s;
    };

    if (score(r) >= score(prev)) byKey.set(key, r);
  }

  const deduped = Array.from(byKey.values());
  deduped.sort((a, b) => String(b.updatedAt ?? b.startedAt ?? "").localeCompare(String(a.updatedAt ?? a.startedAt ?? "")));
  return { ok: true as const, dir, runs: deduped };
}

async function normalizeRunFile(
  teamId: string, 
  workflowId: string, 
  parsed: unknown, 
  runIdFallback: string, 
  runDirPath?: string
): Promise<WorkflowRunFileV1> {
  // Kitchen schema
  if (parsed && typeof parsed === "object" && (parsed as { schema?: unknown }).schema === "clawkitchen.workflow-run.v1") {
    return parsed as WorkflowRunFileV1;
  }

  // Runner schema (RunLog from ClawRecipes). Convert to Kitchen's display schema.
  if (parsed && typeof parsed === "object" && "runId" in parsed && "workflow" in parsed) {
    const o = parsed as {
      runId?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
      status?: unknown;
      workflow?: { id?: unknown; file?: unknown };
      nodeResults?: unknown;
    };

    const wfObj = o.workflow && typeof o.workflow === "object" ? o.workflow : {};
    const file = typeof wfObj.file === "string" ? wfObj.file : "";
    const inferredWfId = file ? path.basename(file).replace(/\.workflow\.json$/i, "") : "";
    const wfId = typeof wfObj.id === "string" && wfObj.id ? wfObj.id : inferredWfId || workflowId;

    const statusRaw = String(o.status ?? "");
    const status: WorkflowRunFileV1["status"] =
      statusRaw === "awaiting_approval"
        ? "waiting_for_approval"
        : statusRaw === "completed"
          ? "success"
          : statusRaw === "rejected"
            ? "error"
            : statusRaw === "error"
              ? "error"
              : statusRaw === "canceled"
                ? "canceled"
                : "running";

    // nodeStates is the authoritative per-node status map written by the worker.
    // nodeResults may lack a status field, so cross-reference nodeStates.
    const nodeStatesRaw = (parsed as { nodeStates?: unknown }).nodeStates;
    const nodeStatesMap: Record<string, { status?: string; ts?: string }> =
      nodeStatesRaw && typeof nodeStatesRaw === "object" && !Array.isArray(nodeStatesRaw)
        ? (nodeStatesRaw as Record<string, { status?: string; ts?: string }>)
        : {};

    const nodes = Array.isArray(o.nodeResults)
      ? o.nodeResults
          .map((nr) => {
            if (!nr || typeof nr !== "object") return null;
            const r = nr as {
              nodeId?: unknown;
              status?: unknown;
              startedAt?: unknown;
              endedAt?: unknown;
              output?: unknown;
              error?: unknown;
            };
            const nodeId = typeof r.nodeId === "string" ? r.nodeId : "";
            if (!nodeId) return null;

            // Prefer nodeStates (authoritative) over nodeResults.status (often absent).
            const stateEntry = nodeStatesMap[nodeId];
            const st = String(stateEntry?.status ?? r.status ?? "pending");
            const mapped =
              st === "awaiting_approval"
                ? "waiting"
                : st === "completed"
                  ? "success"
                  : st === "error"
                    ? "error"
                    : st;

            const allowed = ["pending", "running", "waiting", "success", "error", "skipped"] as const;
            const status = (allowed as readonly string[]).includes(mapped) ? (mapped as (typeof allowed)[number]) : "pending";

            const error =
              typeof r.error === "string"
                ? r.error
                : r.error && typeof r.error === "object" && "message" in r.error
                  ? { message: String((r.error as { message?: unknown }).message ?? "") }
                  : undefined;

            const startedAt = typeof r.startedAt === "string" ? r.startedAt : undefined;
            const endedAt = typeof r.endedAt === "string" ? r.endedAt : (stateEntry?.ts ? stateEntry.ts : undefined);

            return {
              nodeId,
              status,
              ...(startedAt ? { startedAt } : {}),
              ...(endedAt ? { endedAt } : {}),
              ...(typeof r.output !== "undefined" ? { output: r.output } : {}),
              ...(typeof error !== "undefined" ? { error } : {}),
            } satisfies WorkflowRunNodeResultV1;
          })
          .filter((x): x is WorkflowRunNodeResultV1 => x !== null)
      : undefined;

    // Attach handoff metadata from events to matching node results
    const eventsRaw = (parsed as { events?: unknown[] }).events;
    if (nodes && Array.isArray(eventsRaw)) {
      for (const ev of eventsRaw) {
        if (!ev || typeof ev !== "object") continue;
        const e = ev as { type?: string; nodeId?: string; targetTeamId?: string; targetWorkflowId?: string; targetRunId?: string };
        if (e.type === "node.completed" && e.targetRunId && e.targetTeamId && e.targetWorkflowId) {
          const match = nodes.find((n) => n.nodeId === e.nodeId);
          if (match) {
            match.handoff = {
              targetTeamId: e.targetTeamId,
              targetWorkflowId: e.targetWorkflowId,
              targetRunId: e.targetRunId,
            };
          }
        }
      }
    }

    // Read approval file from ClawRecipes format if available
    let approval: WorkflowRunFileV1["approval"] = undefined;
    if (runDirPath) {
      const approvalFile = path.join(runDirPath, "approvals", "approval.json");
      try {
        const approvalRaw = await fs.readFile(approvalFile, "utf8");
        const approvalData = JSON.parse(approvalRaw) as {
          nodeId?: string;
          status?: string;
          requestedAt?: string;
          decidedAt?: string;
          note?: string;
          decidedBy?: string;
          bindingId?: string;
        };

        if (approvalData.nodeId) {
          const state = 
            approvalData.status === "approved" ? "approved" as const :
            approvalData.status === "rejected" ? "changes_requested" as const :
            approvalData.status === "canceled" ? "canceled" as const :
            "pending" as const;

          approval = {
            nodeId: approvalData.nodeId,
            state,
            requestedAt: approvalData.requestedAt,
            decidedAt: approvalData.decidedAt,
            note: approvalData.note,
            decidedBy: approvalData.decidedBy,
          };
        }
      } catch {
        // Ignore approval file read errors - approval files may not exist
      }
    }

    return {
      schema: "clawkitchen.workflow-run.v1",
      id: typeof o.runId === "string" ? o.runId : runIdFallback,
      workflowId: wfId,
      teamId,
      startedAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
      endedAt:
        status === "success" || status === "error" || status === "canceled"
          ? typeof o.updatedAt === "string"
            ? o.updatedAt
            : undefined
          : undefined,
      status,
      summary: "Executed by workflow runner",
      nodes,
      approval,
    };
  }

  // Unknown schema; keep a placeholder so UI can still render.
  return {
    schema: "clawkitchen.workflow-run.v1",
    id: runIdFallback,
    workflowId,
    teamId,
    startedAt: new Date().toISOString(),
    status: "error",
    summary: "Malformed run file",
  };
}