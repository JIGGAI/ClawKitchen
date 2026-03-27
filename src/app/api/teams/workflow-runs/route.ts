import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { jsonOkRest, parseJsonBody } from "@/lib/api-route-helpers";
import { handleWorkflowRunsGet } from "@/lib/workflows/api-handlers";
import { errorMessage } from "@/lib/errors";
import { toolsInvoke } from "@/lib/gateway";
import { runOpenClaw } from "@/lib/openclaw";
import { assertSafeRelativeFileName, getTeamWorkspaceDir } from "@/lib/paths";
import { listWorkflowRuns, readWorkflowRun, writeWorkflowRun } from "@/lib/workflows/runs-storage";
import type { WorkflowRunFileV1, WorkflowRunNodeResultV1 } from "@/lib/workflows/runs-types";
import { readWorkflow } from "@/lib/workflows/storage";
import type { WorkflowFileV1 } from "@/lib/workflows/types";

function nowIso() {
  return new Date().toISOString();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

async function appendTeamFile(teamId: string, relPath: string, content: string) {
  const safe = assertSafeRelativeFileName(relPath);
  const teamDir = await getTeamWorkspaceDir(teamId);
  const full = path.join(teamDir, safe);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.appendFile(full, content, "utf8");
  return { full };
}

function templateReplace(input: string, vars: Record<string, string>) {
  let out = input;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}


// v2 runner-only execution: Kitchen never executes workflow tool nodes.
// These helpers exist only to support approval node UX (best-effort outbound notification metadata).
async function resolveApprovalChannel({
  workflow,
}: {
  workflow: WorkflowFileV1;
}): Promise<{ provider: string | null; target: string | null }> {
  // Best-effort: allow workflow.meta.approvalChannel to declare a delivery target.
  const meta = workflow.meta && typeof workflow.meta === "object" ? (workflow.meta as Record<string, unknown>) : {};
  const approvalChannel = typeof meta.approvalChannel === "string" ? meta.approvalChannel.trim() : "";
  if (!approvalChannel) return { provider: null, target: null };

  // Format: "telegram:-100123456" or just "-100123456".
  if (approvalChannel.includes(":")) {
    const [provider, target] = approvalChannel.split(":", 2);
    return { provider: provider || null, target: target || null };
  }

  return { provider: "telegram", target: approvalChannel };
}

async function maybeSendApprovalRequest(_args: {
  teamId: string;
  workflow: WorkflowFileV1;
  run: WorkflowRunFileV1;
  approvalNodeId: string;
}) {
  // Intentionally NO-OP for now.
  // The runner will handle any external messaging; Kitchen only records state.
  if (!_args) return;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function parseExecCommandFromArgs(
  args: Record<string, unknown>
): { command: string; bin: string; argv?: string[] } {
  const commandArray = Array.isArray(args.commandArray) ? args.commandArray : Array.isArray(args.command) ? args.command : null;
  if (commandArray && commandArray.length) {
    const parts = commandArray.map((x: unknown) => String(x ?? "").trim()).filter(Boolean);
    if (!parts.length) throw new Error("runtime.exec requires a non-empty command");
    return { command: parts.join(" "), bin: path.basename(parts[0]), argv: parts };
  }

  const cmd = String(args.command ?? "").trim();
  if (!cmd) throw new Error("runtime.exec requires args.command");
  const first = cmd.split(/\s+/)[0] || "";
  const bin = path.basename(first);
  return { command: cmd, bin };
}

async function execLocal({
  command,
  argv,
  cwd,
  timeoutMs,
}: {
  command: string;
  argv?: string[];
  cwd?: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: string | null }> {
  // Keep this intentionally simple + safe:
  // - default to argv (no shell) when provided
  // - if only a string is provided, split on whitespace (still no shell)
  const parts = argv && argv.length ? argv : command.split(/\s+/).filter(Boolean);
  const file = parts[0];
  const fileArgs = parts.slice(1);

  return await new Promise((resolve, reject) => {
    const child = spawn(file, fileArgs, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const maxBytes = 64 * 1024;
    child.stdout?.on("data", (b: Buffer) => {
      if (stdout.length < maxBytes) stdout += b.toString("utf8").slice(0, maxBytes - stdout.length);
    });
    child.stderr?.on("data", (b: Buffer) => {
      if (stderr.length < maxBytes) stderr += b.toString("utf8").slice(0, maxBytes - stderr.length);
    });

    const t = setTimeout(() => {
      child.kill("SIGKILL");
    }, Math.max(0, timeoutMs));

    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });

    child.on("close", (code, signal) => {
      clearTimeout(t);
      resolve({ stdout, stderr, exitCode: code, signal });
    });
  });
}

function resolveExecPolicy(workflow: WorkflowFileV1, nodeCfg: Record<string, unknown>) {
  const meta = isRecord(workflow.meta) ? workflow.meta : {};

  const metaAllowBins = asStringArray((meta as Record<string, unknown>).execAllowBins);
  const metaAllowCommands = asStringArray((meta as Record<string, unknown>).execAllowCommands);

  // Node overrides/adds.
  const nodeAllowBins = asStringArray(nodeCfg.execAllowBins);
  const nodeAllowCommands = asStringArray(nodeCfg.execAllowCommands);

  return {
    allowBins: new Set([...metaAllowBins, ...nodeAllowBins]),
    allowCommands: new Set([...metaAllowCommands, ...nodeAllowCommands]),
    host: String(nodeCfg.execHost ?? (meta as Record<string, unknown>).execHost ?? "gateway"),
    security: String(nodeCfg.execSecurity ?? (meta as Record<string, unknown>).execSecurity ?? "allowlist"),
    ask: String(nodeCfg.execAsk ?? (meta as Record<string, unknown>).execAsk ?? "on-miss"),
    timeout: Number(nodeCfg.execTimeoutSeconds ?? (meta as Record<string, unknown>).execTimeoutSeconds ?? 300),
  };
}

async function executeToolNode({
  teamId,
  workflow,
  run,
  nodeId,
  startedAt,
  endedAt,
}: {
  teamId: string;
  workflow: WorkflowFileV1;
  run: WorkflowRunFileV1;
  nodeId: string;
  startedAt: string;
  endedAt: string;
}): Promise<WorkflowRunNodeResultV1> {
  const wfNode = Array.isArray(workflow.nodes) ? workflow.nodes.find((n) => n.id === nodeId) : undefined;
  const cfg = wfNode?.config && typeof wfNode.config === "object" ? (wfNode.config as Record<string, unknown>) : {};
  const tool = typeof cfg.tool === "string" && cfg.tool.trim() ? cfg.tool.trim() : "(unknown)";
  const args = cfg.args && typeof cfg.args === "object" ? (cfg.args as Record<string, unknown>) : {};

  const vars = {
    date: endedAt,
    "run.id": run.id,
    "workflow.id": workflow.id,
    "workflow.name": workflow.name || workflow.id,
  };

  if (tool === "fs.append") {
    const pVal = typeof args.path === "string" ? args.path : "";
    const cVal = typeof args.content === "string" ? args.content : "";
    if (!pVal) throw new Error("fs.append requires args.path");
    if (!cVal) throw new Error("fs.append requires args.content");

    const content = templateReplace(cVal, vars);
    const { full } = await appendTeamFile(teamId, pVal, content);
    return {
      nodeId,
      status: "success",
      startedAt,
      endedAt,
      output: { tool, appendedTo: full, bytes: content.length },
    };
  }

  if (tool === "runtime.exec") {
    const pol = resolveExecPolicy(workflow, cfg);
    const { command, bin, argv } = parseExecCommandFromArgs(args);

    if (pol.allowCommands.size && !pol.allowCommands.has(command)) {
      throw new Error(`runtime.exec command not allowlisted: ${command}`);
    }
    if (!pol.allowCommands.size && (pol.allowBins.size === 0 || !pol.allowBins.has(bin))) {
      throw new Error(`runtime.exec bin not allowlisted: ${bin} (set workflow.meta.execAllowBins or node.config.execAllowBins)`);
    }

    const workdirRel = typeof args.cwd === "string" ? args.cwd : typeof args.workdir === "string" ? args.workdir : "";
    let workdir: string | undefined;
    if (workdirRel) {
      const teamDir = await getTeamWorkspaceDir(teamId);
      const resolved = path.resolve(teamDir, workdirRel);
      if (!resolved.startsWith(teamDir + path.sep) && resolved !== teamDir) {
        throw new Error("runtime.exec cwd must be within the team workspace");
      }
      workdir = resolved;
    }

    const execEnabled = process.env.KITCHEN_ENABLE_WORKFLOW_RUNTIME_EXEC === "1";
    if (!execEnabled) {
      throw new Error("Tool not available: exec");
    }

    const backend = (process.env.KITCHEN_WORKFLOW_EXEC_BACKEND || "gateway-first").trim();

    let result: unknown;
    if (backend === "local") {
      result = await execLocal({ command, argv, cwd: workdir, timeoutMs: pol.timeout * 1000 });
    } else {
      try {
        result = await toolsInvoke({
          tool: "exec",
          args: {
            command,
            workdir,
            timeout: pol.timeout,
            host: pol.host,
            security: pol.security,
            ask: pol.ask,
          },
        });
      } catch (e: unknown) {
        // For dev/testing, fall back to local execution if the gateway doesn't expose exec.
        if (backend === "gateway-first" && /Tool not available:\s*exec/i.test(errorMessage(e))) {
          result = await execLocal({ command, argv, cwd: workdir, timeoutMs: pol.timeout * 1000 });
        } else {
          throw e;
        }
      }
    }

    return {
      nodeId,
      status: "success",
      startedAt,
      endedAt,
      output: { tool, command, result },
    };
  }

  return {
    nodeId,
    status: "success",
    startedAt,
    endedAt,
    output: { tool, result: "(no-op: tool not implemented)" },
  };
}

async function maybeExecutePendingNodesAfterApproval({
  teamId,
  workflow,
  run,
  approvalNodeId,
  decidedAt,
}: {
  teamId: string;
  workflow: WorkflowFileV1;
  run: WorkflowRunFileV1;
  approvalNodeId: string;
  decidedAt: string;
}) {
  const wfNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const approvalIdx = wfNodes.findIndex((n) => n.id === approvalNodeId);
  if (approvalIdx < 0) return run;

  const nextNodes: WorkflowRunNodeResultV1[] = Array.isArray(run.nodes)
    ? await Promise.all(
        run.nodes.map(async (n) => {
          const wfIdx = wfNodes.findIndex((wfn) => wfn.id === n.nodeId);
          const afterApproval = wfIdx >= 0 && wfIdx > approvalIdx;

          if (!afterApproval || n.status !== "pending") return n;

          const wfNode = wfIdx >= 0 ? wfNodes[wfIdx] : undefined;
          const startedAt = n.startedAt ?? decidedAt;

          if (wfNode?.type === "tool") {
            try {
              return await executeToolNode({
                teamId,
                workflow,
                run,
                nodeId: n.nodeId,
                startedAt,
                endedAt: decidedAt,
              });
            } catch (e: unknown) {
              return {
                ...n,
                status: "error",
                startedAt,
                endedAt: decidedAt,
                output: { error: errorMessage(e) },
              };
            }
          }

          return {
            ...n,
            status: "success",
            startedAt,
            endedAt: decidedAt,
            output: n.output ?? { note: "(resumed after approval)" },
          };
        })
      )
    : [];

  return { ...run, nodes: nextNodes };
}


export async function GET(req: Request) {
  return handleWorkflowRunsGet(req, readWorkflowRun, listWorkflowRuns);
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req);
  if (parsed instanceof NextResponse) return parsed;
  const { body: o } = parsed;

  const teamId = String(o.teamId ?? "").trim();
  const workflowId = String(o.workflowId ?? "").trim();
  const mode = String(o.mode ?? "").trim();
  const action = String(o.action ?? "").trim();
  const modeNorm = mode || "enqueue";
  const runIdFromBody = String(o.runId ?? "").trim();
  const note = typeof o.note === "string" ? o.note : undefined;
  const decidedBy = typeof o.decidedBy === "string" ? o.decidedBy : undefined;

  // Canonical execution mode:
  // - enqueue: create run only
  // - run_now: create run + kick runner loop
  // (future) execute/run_now option is handled in the runner, not Kitchen.

  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });
  if (!workflowId) return NextResponse.json({ ok: false, error: "workflowId is required" }, { status: 400 });

  try {
    // Action mode: approve/request_changes/cancel (file-first) updates an existing run.
    if (action) {
      if (!runIdFromBody) return NextResponse.json({ ok: false, error: "runId is required for action" }, { status: 400 });
      if (!["approve", "request_changes", "cancel"].includes(action)) {
        return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
      }

      const existing = await readWorkflowRun(teamId, workflowId, runIdFromBody);
      const run = existing.run;

      const approvalNodeId = run.approval?.nodeId || (Array.isArray(run.nodes) ? run.nodes.find((n) => n.status === "waiting")?.nodeId : undefined);
      if (!approvalNodeId) {
        return NextResponse.json({ ok: false, error: "Run is not awaiting approval" }, { status: 400 });
      }

      const decidedAt = nowIso();
      const nextState = action === "approve" ? "approved" : action === "request_changes" ? "changes_requested" : "canceled";

      const nextStatus: WorkflowRunFileV1["status"] =
        nextState === "approved" ? "success" : nextState === "canceled" ? "canceled" : "waiting_for_approval";

      const nextNodes: WorkflowRunNodeResultV1[] = Array.isArray(run.nodes)
        ? run.nodes.map((n) => {
            if (n.nodeId === approvalNodeId) {
              const existingOutput = typeof n.output === "object" && n.output ? (n.output as Record<string, unknown>) : {};
              return {
                ...n,
                status: nextState === "approved" ? "success" : nextState === "canceled" ? "error" : "waiting",
                endedAt: nextState === "changes_requested" ? n.endedAt : decidedAt,
                output: {
                  ...existingOutput,
                  decision: nextState,
                  note,
                  decidedBy,
                },
              };
            }

            if (nextState === "canceled" && n.status === "pending") {
              return {
                ...n,
                status: "skipped",
                startedAt: n.startedAt ?? decidedAt,
                endedAt: decidedAt,
                output: n.output ?? { note: "skipped due to cancel" },
              };
            }

            return n;
          })
        : [];

      const nextRun: WorkflowRunFileV1 = {
        ...run,
        status: nextStatus,
        endedAt: nextStatus === "success" || nextStatus === "canceled" ? decidedAt : run.endedAt,
        approval: {
          nodeId: approvalNodeId,
          state: nextState,
          requestedAt: run.approval?.requestedAt,
          decidedAt: nextState === "changes_requested" ? undefined : decidedAt,
          note,
          decidedBy,
        },
        nodes: nextNodes,
      };


      let finalRun: WorkflowRunFileV1 = nextRun;

      // Best-effort: for sample runs, simulate resuming execution after approval by resolving
      // pending nodes and performing file-first writeback steps (fs.append).
      if (action === "approve") {
        try {
          const wf = (await readWorkflow(teamId, workflowId)).workflow;
          finalRun = await maybeExecutePendingNodesAfterApproval({
            teamId,
            workflow: wf,
            run: nextRun,
            approvalNodeId,
            decidedAt,
          });
          const hasError = Array.isArray(finalRun.nodes) && finalRun.nodes.some((n) => n.status === "error");
          if (hasError) {
            finalRun = { ...finalRun, status: "error", endedAt: decidedAt };
          }
        } catch {
          // ignore; keep file-first decision recorded
        }
      }

      return jsonOkRest({ ...(await writeWorkflowRun(teamId, workflowId, finalRun)), runId: run.id });
    }



    // Enqueue / run_now (canonical): delegate run creation to the CLI and return the canonical runId.
    // Kitchen must not author any run artifacts in these modes.
    if (modeNorm === "enqueue" || modeNorm === "run_now") {
      const wf = (await readWorkflow(teamId, workflowId)).workflow;

      // Preflight: nodes (excluding start/end/approval) must be assigned to an agent.
      const missing = (Array.isArray(wf.nodes) ? wf.nodes : [])
        .filter((n) =>
          n &&
          typeof n === "object" &&
          (n as { type?: unknown }).type !== "start" &&
          (n as { type?: unknown }).type !== "end" &&
          (n as { type?: unknown }).type !== "human_approval"
        )
        .filter((n) => {
          const cfg = (n as { config?: unknown }).config;
          const o = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? (cfg as Record<string, unknown>) : {};
          return !String(o.agentId ?? "").trim();
        })
        .map((n) => String((n as { id?: unknown }).id ?? ""))
        .filter(Boolean);
      if (missing.length) {
        throw new Error(`All nodes must be assigned to an agent. Missing agentId on: ${missing.join(", ")}`);
      }

      const workflowFile = `${workflowId}.workflow.json`;

      const enqueueRes = await runOpenClaw([
        "recipes",
        "workflows",
        "run",
        "--team-id",
        teamId,
        "--workflow-file",
        workflowFile,
      ]);
      if (!enqueueRes.ok) throw new Error(enqueueRes.stderr || enqueueRes.stdout || "Failed to enqueue workflow run");

      const enqueueJson = JSON.parse(String(enqueueRes.stdout ?? "{}")) as {
              ok?: boolean;
              runId?: string;
              runLogPath?: string;
              path?: string;
            };
            
            const rawRunId = String(enqueueJson.runId ?? "").trim();
            const runLogPath = String(enqueueJson.runLogPath ?? enqueueJson.path ?? "").trim();
            if (!rawRunId && !runLogPath) throw new Error("Enqueue succeeded but did not return runId");
            
            const canonicalRunId = (() => {
              const p = runLogPath;
              if (p) {
                const m1 = p.match(/workflow-runs\/([^/]+)\/run\.json$/);
                if (m1?.[1]) return m1[1];
                const m2 = p.match(/workflow-runs\/([^/]+)\.run\.json$/);
                if (m2?.[1]) return m2[1];
              }
              return rawRunId;
            })();
            if (!canonicalRunId) throw new Error("Enqueue succeeded but did not return runId");
            
            const enqRunId = canonicalRunId;

      if (modeNorm === "run_now") {
        const agentListRes = await runOpenClaw(["agents", "list", "--json"]);
        if (!agentListRes.ok) throw new Error(agentListRes.stderr || agentListRes.stdout || "Failed to list agents");
        const agentList = JSON.parse(String(agentListRes.stdout ?? "[]")) as Array<{ id?: unknown }>;
        const knownAgentIds = new Set(agentList.map((a) => String(a.id ?? "").trim()).filter(Boolean));

        const requiredAgentIds = (Array.isArray(wf.nodes) ? wf.nodes : [])
          .filter((n) =>
            n &&
            typeof n === "object" &&
            (n as { type?: unknown }).type !== "start" &&
            (n as { type?: unknown }).type !== "end" &&
            (n as { type?: unknown }).type !== "human_approval"
          )
          .map((n) => {
            const cfg = (n as { config?: unknown }).config;
            const o = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? (cfg as Record<string, unknown>) : {};
            return String(o.agentId ?? "").trim();
          })
          .filter(Boolean);

        const uniq = Array.from(new Set(requiredAgentIds));
        const missingAgents = uniq.filter((id) => !knownAgentIds.has(id));
        if (missingAgents.length) {
          throw new Error(
            `Unknown agentId(s) in workflow node assignments: ${missingAgents.join(", ")}. ` +
              `These must match real OpenClaw agent ids (see openclaw agents list).`
          );
        }

        // Claim specifically the run we just enqueued (--run-id prevents picking up stale runs).
        const runnerRes = await runOpenClaw(["recipes", "workflows", "runner-once", "--team-id", teamId, "--run-id", enqRunId]);
        if (!runnerRes.ok) throw new Error(runnerRes.stderr || runnerRes.stdout || "Failed to run runner-once");
<<<<<<< HEAD

        // Fire-and-forget: kick workers in the background so the run advances.
        // Cron workers will also pick up the work, so this is just best-effort acceleration.
        // We do NOT await this — return the runId to the UI immediately for redirect.
        const workerAgentIds = [...uniq];
        void (async () => {
          try {
<<<<<<< HEAD
            for (const agentId of workerAgentIds) {
              await runOpenClaw([
                "recipes", "workflows", "worker-tick",
                "--team-id", teamId, "--agent-id", agentId,
                "--limit", "5", "--worker-id", "kitchen-run-now",
              ]);
            }
            const { run: postRun } = await readWorkflowRun(teamId, workflowId, enqRunId);
            const postStatus = String((postRun as unknown as { status?: unknown }).status ?? "");
            if (postStatus === "waiting_workers") {
              for (const agentId of workerAgentIds) {
                await runOpenClaw([
                  "recipes", "workflows", "worker-tick",
                  "--team-id", teamId, "--agent-id", agentId,
                  "--limit", "5", "--worker-id", "kitchen-run-now-pass2",
                ]);
              }
            }
          } catch { /* best-effort — cron workers will pick up remaining work */ }
        })();
=======
            const { run } = await readWorkflowRun(teamId, workflowId, enqRunId);
            const statusAny = (run as unknown as { status?: unknown }).status;
            if (statusAny && String(statusAny) != "queued") break;
          } catch {
            // fall through
          }

          await new Promise((r) => setTimeout(r, 250));
        }
=======
>>>>>>> 3ae5c12 (fix: pass --run-id to runner-once to prevent duplicate runs)

        // Best-effort: kick workers immediately so the run advances.
        // Failures here must NOT prevent returning the runId to the UI.
        try {
          for (const agentId of uniq) {
            await runOpenClaw([
              "recipes",
              "workflows",
              "worker-tick",
              "--team-id",
              teamId,
              "--agent-id",
              agentId,
              "--limit",
              "5",
              "--worker-id",
              "kitchen-run-now",
            ]);
          }

          // Second pass: nodes like human_approval get re-enqueued onto the
          // agent that just finished the prior node.  The first pass won't have
          // ticked that agent a second time, so re-tick all agents if the run
          // is still in-flight.
          const { run: postRun } = await readWorkflowRun(teamId, workflowId, enqRunId);
          const postStatus = String((postRun as unknown as { status?: unknown }).status ?? "");
          if (postStatus === "waiting_workers") {
            for (const agentId of uniq) {
              await runOpenClaw([
                "recipes", "workflows", "worker-tick",
                "--team-id", teamId,
                "--agent-id", agentId,
                "--limit", "5",
                "--worker-id", "kitchen-run-now-pass2",
              ]);
            }
          }
        } catch {
          // best-effort — cron workers will pick up remaining work
        }
>>>>>>> cd42640 (fix: wrap run_now worker-tick in best-effort so runId always returns)
      }

      return jsonOkRest({
        ok: true,
        runId: enqRunId,
        path: `shared-context/workflow-runs/${enqRunId}/run.json`,
        ...(runLogPath ? { runLogPath } : {}),
      });
    }
    // Create mode
    const run: WorkflowRunFileV1 =
      modeNorm === "sample"
        ? await (async () => {
            const wf = (await readWorkflow(teamId, workflowId)).workflow;

            const runId = `run-${nowIso().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`.toLowerCase();
            const t0 = Date.now();

            const templateId =
              wf.meta && typeof wf.meta === "object" && "templateId" in wf.meta ? (wf.meta as Record<string, unknown>).templateId : undefined;
            const isMarketingCadence = templateId === "marketing-cadence-v1";

            const marketingDrafts = isMarketingCadence
              ? {
                  x: {
                    hook: "Stop losing hours to repetitive agent setup.",
                    body: "ClawRecipes scaffolds entire teams of agents in one command — workflows, roles, conventions, and a human-approval gate before posting.",
                  },
                  instagram: {
                    hook: "Ship agent workflows faster.",
                    body: "From idea → drafted assets → brand QC → approval → posting. File-first workflows you can export and version.",
                    assetNotes: "Square image: diagram of workflow nodes + approval gate.",
                  },
                  tiktok: {
                    hook: "POV: you stop copy/pasting prompts.",
                    script: "Today I’m building a marketing cadence workflow that researches, drafts, QC’s, then waits for human approval before it posts. File-first. Portable. No magic.",
                    assetNotes: "15–25s screen recording of the canvas + approval buttons.",
                  },
                  youtube: {
                    hook: "Build a marketing cadence workflow (with human approval) in 2 minutes.",
                    script: "We’ll wire research → drafts → QC → approval → post nodes, and persist the whole thing to shared-context/workflows/*.workflow.json so it’s portable.",
                    assetNotes: "Thumbnail: workflow canvas with 'Approve & Post' highlighted.",
                  },
                }
              : null;

            const approvalIdx = wf.nodes.findIndex((n) => n.type === "human_approval");
            const approvalNodeId = approvalIdx >= 0 ? wf.nodes[approvalIdx]?.id : undefined;

            const nodeResults: WorkflowRunNodeResultV1[] = wf.nodes.map((n, idx) => {
              const startedAt = new Date(t0 + idx * 350).toISOString();
              const endedAt = new Date(t0 + idx * 350 + 200).toISOString();

              const beforeApproval = approvalIdx < 0 ? true : idx < approvalIdx;
              const isApproval = approvalNodeId ? n.id === approvalNodeId : false;
              const afterApproval = approvalIdx >= 0 && idx > approvalIdx;

              const base: WorkflowRunNodeResultV1 = {
                nodeId: n.id,
                status: beforeApproval ? "success" : afterApproval ? "pending" : isApproval ? "waiting" : "success",
                startedAt,
                endedAt: beforeApproval ? endedAt : undefined,
              };

              if (n.type === "llm") {
                const marketingOutput =
                  beforeApproval && isMarketingCadence
                    ? n.id === "research"
                      ? {
                          model: "(sample)",
                          kind: "research",
                          bullets: [
                            "New agent teams are compelling when they’re portable + file-first.",
                            "Human approval gates are mandatory for auto-post workflows.",
                            "Cron triggers need timezone + preset suggestions.",
                          ],
                        }
                      : n.id === "draft_assets"
                        ? {
                            model: "(sample)",
                            kind: "draft_assets",
                            drafts: marketingDrafts,
                          }
                        : n.id === "qc_brand"
                          ? {
                              model: "(sample)",
                              kind: "qc_brand",
                              notes: [
                                "Keep claims concrete (no ‘magic’).",
                                "Mention ClawRecipes before OpenClaw.",
                                "Explicitly state: no posting without approval.",
                              ],
                            }
                          : {
                              model: "(sample)",
                              text: `Sample output for ${n.id}`,
                            }
                    : null;

                return {
                  ...base,
                  output: beforeApproval
                    ? marketingOutput ?? {
                        model: "(sample)",
                        text: `Sample output for ${n.id}`,
                      }
                    : undefined,
                };
              }

              if (n.type === "tool") {
                const toolVal = n.config && typeof n.config === "object" ? (n.config as Record<string, unknown>).tool : undefined;
                const tool = typeof toolVal === "string" && toolVal.trim() ? toolVal.trim() : "(unknown)";
                return {
                  ...base,
                  output: beforeApproval
                    ? {
                        tool,
                        result: "(sample tool result)",
                      }
                    : undefined,
                };
              }

              if (n.type === "human_approval") {
                const approvalPacket = isMarketingCadence
                  ? {
                      channel: "(sample)",
                      decision: "pending",
                      options: ["approve", "request_changes", "cancel"],
                      packet: {
                        templateId: "marketing-cadence-v1",
                        note: "Per-platform drafts (sample) — approve to post, request changes to loop, or cancel.",
                        platforms: {
                          x: marketingDrafts?.x,
                          instagram: marketingDrafts?.instagram,
                          tiktok: marketingDrafts?.tiktok,
                          youtube: marketingDrafts?.youtube,
                        },
                      },
                    }
                  : {
                      channel: "(sample)",
                      decision: "pending",
                      options: ["approve", "request_changes", "cancel"],
                    };

                return {
                  ...base,
                  output: approvalPacket,
                };
              }

              return base;
            });

            const status: WorkflowRunFileV1["status"] = approvalNodeId ? "waiting_for_approval" : "success";

            const baseRun: WorkflowRunFileV1 = {
              schema: "clawkitchen.workflow-run.v1",
              id: runId,
              workflowId,
              startedAt: new Date(t0).toISOString(),
              endedAt: approvalNodeId ? undefined : new Date(t0 + wf.nodes.length * 350 + 200).toISOString(),
              status,
              summary: approvalNodeId
                ? "Sample run (awaiting approval)"
                : "Sample run (generated by ClawKitchen UI)",
              nodes: nodeResults,
              approval: approvalNodeId
                ? {
                    nodeId: approvalNodeId,
                    state: "pending",
                    requestedAt: new Date(t0 + approvalIdx * 350).toISOString(),
                  }
                : undefined,
            };

            if (approvalNodeId) {
              // Resolve the channel we *intend* to send to so we can record outbound metadata,
              // even though delivery is best-effort.
              const { provider, target } = await resolveApprovalChannel({ workflow: wf });

              if (target) {
                try {
                  await maybeSendApprovalRequest({ teamId, workflow: wf, run: baseRun, approvalNodeId });
                  baseRun.approval = {
                    ...baseRun.approval,
                    outbound: { provider, target, sentAt: nowIso() },
                  } as WorkflowRunFileV1["approval"];
                } catch (e: unknown) {
                  baseRun.approval = {
                    ...baseRun.approval,
                    outbound: { provider, target, error: errorMessage(e), attemptedAt: nowIso() },
                  } as WorkflowRunFileV1["approval"];
                }
              }
            }

            return baseRun satisfies WorkflowRunFileV1;
          })()
        : await (async () => {

            // v2: delegate to CLI for enqueue/run-now (Kitchen should not author run artifacts).
            if (!["execute", "enqueue", "run_now", "sample"].includes(modeNorm)) {
              throw new Error(`Unsupported mode: ${modeNorm}`);
            }

            const wf = (await readWorkflow(teamId, workflowId)).workflow;

            // Preflight: nodes (excluding start/end) must be assigned to an agent.
            const missing = (Array.isArray(wf.nodes) ? wf.nodes : [])
              .filter((n) =>
                n &&
                typeof n === "object" &&
                (n as { type?: unknown }).type !== "start" &&
                (n as { type?: unknown }).type !== "end" &&
                (n as { type?: unknown }).type !== "human_approval"
              )
              .filter((n) => {
                const cfg = (n as { config?: unknown }).config;
                const o = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? (cfg as Record<string, unknown>) : {};
                return !String(o.agentId ?? "").trim();
              })
              .map((n) => String((n as { id?: unknown }).id ?? ""))
              .filter(Boolean);
            if (missing.length) {
              throw new Error(`All nodes must be assigned to an agent. Missing agentId on: ${missing.join(", ")}`);
            }

            const workflowFile = `${workflowId}.workflow.json`;

            // Delegate enqueue to ClawRecipes (CLI) which owns the canonical run folder/files.
            const enqueueRes = await runOpenClaw([
              "recipes",
              "workflows",
              "run",
              "--team-id",
              teamId,
              "--workflow-file",
              workflowFile,
            ]);
            if (!enqueueRes.ok) throw new Error(enqueueRes.stderr || enqueueRes.stdout || "Failed to enqueue workflow run");

            const enqueueJson = JSON.parse(String(enqueueRes.stdout ?? "{}")) as {
              ok?: boolean;
              runId?: string;
              runLogPath?: string;
              path?: string;
            };
            
            const rawRunId = String(enqueueJson.runId ?? "").trim();
            const runLogPath = String(enqueueJson.runLogPath ?? enqueueJson.path ?? "").trim();
            if (!rawRunId && !runLogPath) throw new Error("Enqueue succeeded but did not return runId");
            
            const canonicalRunId = (() => {
              const p = runLogPath;
              if (p) {
                const m1 = p.match(/workflow-runs\/([^/]+)\/run\.json$/);
                if (m1?.[1]) return m1[1];
                const m2 = p.match(/workflow-runs\/([^/]+)\.run\.json$/);
                if (m2?.[1]) return m2[1];
              }
              return rawRunId;
            })();
            if (!canonicalRunId) throw new Error("Enqueue succeeded but did not return runId");
            
            const enqRunId = canonicalRunId;

            if (modeNorm === "run_now") {
              // Run now = enqueue + runner + workers.
              // NOTE: `worker-tick --agent-id` must match a real agent id (queue file name).
              // If workflow node agentIds are aliases, we fail with a clear message.

              const agentListRes = await runOpenClaw(["agents", "list", "--json"]);
              if (!agentListRes.ok) throw new Error(agentListRes.stderr || agentListRes.stdout || "Failed to list agents");
              const agentList = JSON.parse(String(agentListRes.stdout ?? "[]")) as Array<{ id?: unknown }>;
              const knownAgentIds = new Set(agentList.map((a) => String(a.id ?? "").trim()).filter(Boolean));

              // Kick workers for all required agents referenced by the workflow file.
              const requiredAgentIds = (Array.isArray(wf.nodes) ? wf.nodes : [])
                .filter((n) =>
                  n &&
                  typeof n === "object" &&
                  (n as { type?: unknown }).type !== "start" &&
                  (n as { type?: unknown }).type !== "end" &&
                  (n as { type?: unknown }).type !== "human_approval"
                )
                .map((n) => {
                  const cfg = (n as { config?: unknown }).config;
                  const o = cfg && typeof cfg === "object" && !Array.isArray(cfg) ? (cfg as Record<string, unknown>) : {};
                  return String(o.agentId ?? "").trim();
                })
                .filter(Boolean);

              const uniq = Array.from(new Set(requiredAgentIds));
              const missing = uniq.filter((id) => !knownAgentIds.has(id));
              if (missing.length) {
                throw new Error(
                  `Unknown agentId(s) in workflow node assignments: ${missing.join(", ")}. ` +
                    `These must match real OpenClaw agent ids (see openclaw agents list).`
                );
              }

              // Kick the runner. If the team queue already contains older runs, runner-once may claim
              // the oldest run first. For "run_now" semantics we want to ensure the *newly enqueued*
              // run gets claimed before we tick workers.
              for (let attempt = 0; attempt < 4; attempt++) {
                const runnerRes = await runOpenClaw(["recipes", "workflows", "runner-once", "--team-id", teamId]);
                if (!runnerRes.ok) throw new Error(runnerRes.stderr || runnerRes.stdout || "Failed to run runner-once");

                try {
                  const { run } = await readWorkflowRun(teamId, workflowId, enqRunId);
                  const statusAny = (run as unknown as { status?: unknown }).status;
                  if (statusAny && String(statusAny) != "queued") break;
                } catch {
                  // If we can't read the run yet, fall through to retry after a short delay.
                }

                // Give the filesystem a moment to settle (enqueue/runner writes are file-based).
                await new Promise((r) => setTimeout(r, 250));
              }

              // After retries, ensure our run is no longer queued.
              try {
                const { run } = await readWorkflowRun(teamId, workflowId, enqRunId);
                const statusAny = (run as unknown as { status?: unknown }).status;
                if (String(statusAny) === "queued") {
                  throw new Error(
                    `Run now enqueued runId=${enqRunId}, but runner did not claim it yet (queue may contain older runs). ` +
                      `Please retry, or run: openclaw recipes workflows runner-once --team-id ${teamId}`
                  );
                }
              } catch (e: unknown) {
                // If read fails, still proceed; worker-tick will be a no-op until runner claims.
                // But surface a helpful error if the read error is explicit.
                if (e instanceof Error && e.message.startsWith("Run now enqueued")) throw e;
              }

              for (const agentId of uniq) {
                const workerRes = await runOpenClaw([
                  "recipes",
                  "workflows",
                  "worker-tick",
                  "--team-id",
                  teamId,
                  "--agent-id",
                  agentId,
                  "--limit",
                  "5",
                  "--worker-id",
                  "kitchen-run-now",
                ]);
                if (!workerRes.ok) throw new Error(workerRes.stderr || workerRes.stdout || `Failed worker-tick for ${agentId}`);
              }
            }

            // Return a lightweight Kitchen-schema run so the UI can immediately navigate to it.
            return {
              schema: "clawkitchen.workflow-run.v1",
              id: enqRunId,
              workflowId,
              teamId,
              startedAt: nowIso(),
              status: "running",
              summary: modeNorm === "run_now" ? "Queued + kicked runner/workers" : "Queued for workflow runner",
              nodes: Array.isArray(wf.nodes)
                ? wf.nodes.map((n) => ({ nodeId: String(n.id), status: "pending" as const }))
                : [],
              meta: {
                canonicalRunId: enqRunId,
                ...(runLogPath ? { runLogPath } : {}),
              },
            } satisfies WorkflowRunFileV1;
          })();

    // IMPORTANT:
    // For enqueue/run_now, Kitchen delegates run creation to the CLI. In that mode,
    // Kitchen must NOT author/overwrite any workflow run artifacts. The CLI has
    // already created the canonical run folder:
    //   shared-context/workflow-runs/<runId>/run.json
    // So: return the canonical runId + expected path and let the UI follow up by
    // reading from the canonical location.
    if (modeNorm === "enqueue" || modeNorm === "run_now") {
      const canonicalRunId = String((run.meta as Record<string, unknown> | undefined)?.canonicalRunId ?? run.id);
      return jsonOkRest({
        ok: true,
        runId: canonicalRunId,
        path: `shared-context/workflow-runs/${canonicalRunId}/run.json`,
      });
    }

    return jsonOkRest({ ...(await writeWorkflowRun(teamId, workflowId, run)), runId: run.id });
  } catch (err: unknown) {
    const msg = errorMessage(err);
    if (/^All nodes must be assigned to an agent\./i.test(msg) || /^Unknown agentId\(s\)/i.test(msg)) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
