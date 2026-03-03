import { NextResponse } from "next/server";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { jsonOkRest, parseJsonBody } from "@/lib/api-route-helpers";
import { handleWorkflowRunsGet } from "@/lib/workflows/api-handlers";
import { errorMessage } from "@/lib/errors";
import { toolsInvoke } from "@/lib/gateway";
import { assertSafeRelativeFileName, getTeamWorkspaceDir, readOpenClawConfig } from "@/lib/paths";
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

  const vars = {
    date: decidedAt,
    "run.id": run.id,
    "workflow.id": workflow.id,
    "workflow.name": workflow.name || workflow.id,
  };

  const nextNodes: WorkflowRunNodeResultV1[] = Array.isArray(run.nodes)
    ? await Promise.all(
        run.nodes.map(async (n) => {
          const wfIdx = wfNodes.findIndex((wfn) => wfn.id === n.nodeId);
          const afterApproval = wfIdx >= 0 && wfIdx > approvalIdx;

          if (!afterApproval || n.status !== "pending") return n;

          const wfNode = wfIdx >= 0 ? wfNodes[wfIdx] : undefined;
          const startedAt = n.startedAt ?? decidedAt;

          if (wfNode?.type === "tool") {
            const cfg = wfNode.config && typeof wfNode.config === "object" ? (wfNode.config as Record<string, unknown>) : {};
            const tool = typeof cfg.tool === "string" && cfg.tool.trim() ? cfg.tool.trim() : "(unknown)";

            if (tool === "fs.append") {
              const args = cfg.args && typeof cfg.args === "object" ? (cfg.args as Record<string, unknown>) : {};
              const pVal = typeof args.path === "string" ? args.path : "";
              const cVal = typeof args.content === "string" ? args.content : "";
              if (pVal && cVal) {
                const content = templateReplace(cVal, vars);
                const { full } = await appendTeamFile(teamId, pVal, content);
                return {
                  ...n,
                  status: "success",
                  startedAt,
                  endedAt: decidedAt,
                  output: { tool, appendedTo: full, bytes: content.length },
                };
              }
            }

            return {
              ...n,
              status: "success",
              startedAt,
              endedAt: decidedAt,
              output: { tool, result: "(sample execution after approval)" },
            };
          }

          return {
            ...n,
            status: "success",
            startedAt,
            endedAt: decidedAt,
            output: n.output ?? { note: "(sample execution after approval)" },
          };
        })
      )
    : [];

  return { ...run, nodes: nextNodes };
}

function formatApprovalPacketMessage(workflow: WorkflowFileV1, run: WorkflowRunFileV1, approvalNodeId: string): string {
  const title = `${workflow.name || workflow.id} — Approval needed`;
  const runLine = `Run: ${run.id}`;

  const approvalNode = Array.isArray(run.nodes) ? run.nodes.find((n) => n.nodeId === approvalNodeId) : undefined;
  const out = isRecord(approvalNode?.output) ? approvalNode.output : {};
  const packet = isRecord(out.packet) ? out.packet : null;
  const platforms = packet && isRecord(packet.platforms) ? (packet.platforms as Record<string, unknown>) : null;

  let body = `${title}\n${runLine}\n\n`;

  if (packet && typeof packet.note === "string" && packet.note.trim()) {
    body += `${packet.note.trim()}\n\n`;
  }

  if (platforms) {
    body += "Drafts:\n";
    for (const [k, v] of Object.entries(platforms)) {
      if (!v) continue;
      const p = isRecord(v) ? v : { value: v };
      const hook = typeof p.hook === "string" ? p.hook.trim() : "";
      const text = typeof p.body === "string" ? p.body.trim() : "";
      const script = typeof p.script === "string" ? p.script.trim() : "";
      const notes = typeof p.assetNotes === "string" ? p.assetNotes.trim() : "";

      body += `\n— ${k.toUpperCase()} —\n`;
      if (hook) body += `Hook: ${hook}\n`;
      if (text) body += `Body: ${text}\n`;
      if (script) body += `Script: ${script}\n`;
      if (notes) body += `Notes: ${notes}\n`;
    }
    body += "\n";
  } else {
    body += "(No structured approval packet found in run file.)\n\n";
  }

  body += "Reply in ClawKitchen: Approve / Request changes / Cancel.";
  return body;
}

function applyTemplate(template: string, vars: Record<string, string>) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

function getApprovalMessageTemplate(workflow: WorkflowFileV1, approvalNodeId: string) {
  const meta = isRecord(workflow.meta) ? workflow.meta : {};
  const node = Array.isArray(workflow.nodes) ? workflow.nodes.find((n) => n.id === approvalNodeId) : undefined;
  const cfg = isRecord(node?.config) ? node?.config : {};

  // Node overrides workflow meta.
  return String(cfg.messageTemplate ?? cfg.template ?? meta.approvalMessageTemplate ?? "").trim();
}

function bindingMatchToRef(match: unknown): { id: string; channel: string; target: string } | null {
  if (!isRecord(match)) return null;
  const channel = String(match.channel ?? "").trim();
  if (!channel) return null;

  const accountId = String(match.accountId ?? "").trim();
  if (accountId) return { id: `${channel}:account:${accountId}`, channel, target: accountId };

  const peer = isRecord(match.peer) ? match.peer : null;
  const kind = peer ? String(peer.kind ?? "").trim() : "";
  const peerId = peer ? String(peer.id ?? "").trim() : "";
  if (kind && peerId) return { id: `${channel}:${kind}:${peerId}`, channel, target: peerId };

  return null;
}

async function resolveApprovalChannel({
  workflow,
  approvalNodeId,
}: {
  workflow: WorkflowFileV1;
  approvalNodeId: string;
}): Promise<{ provider: string; target: string }> {
  const meta = isRecord(workflow.meta) ? workflow.meta : {};
  const wfBindingId = String(meta.approvalBindingId ?? "").trim();
  const wfProvider = String(meta.approvalProvider ?? "telegram").trim() || "telegram";
  const wfTarget = String(meta.approvalTarget ?? "").trim();

  const node = Array.isArray(workflow.nodes) ? workflow.nodes.find((n) => n.id === approvalNodeId) : undefined;
  const nodeCfg = isRecord(node?.config) ? node?.config : {};
  const nodeBindingId = String(nodeCfg.approvalBindingId ?? "").trim();
  const nodeProvider = String(nodeCfg.provider ?? "").trim();
  const nodeTarget = String(nodeCfg.target ?? "").trim();

  const desiredBindingId = nodeBindingId || wfBindingId;

  if (desiredBindingId) {
    try {
      const cfg = await readOpenClawConfig();
      const bindings = Array.isArray(cfg.bindings) ? cfg.bindings : [];
      for (const b of bindings) {
        if (!isRecord(b)) continue;
        const ref = bindingMatchToRef(b.match);
        if (ref && ref.id === desiredBindingId) return { provider: ref.channel, target: ref.target };
      }
    } catch {
      // fall through to manual fields
    }
  }

  // Manual precedence: node overrides workflow meta.
  const provider = nodeProvider || wfProvider;
  const target = nodeTarget || wfTarget;
  return { provider, target };
}

async function maybeSendApprovalRequest({
  teamId,
  workflow,
  run,
  approvalNodeId,
}: {
  teamId: string;
  workflow: WorkflowFileV1;
  run: WorkflowRunFileV1;
  approvalNodeId: string;
}) {
  const { provider, target } = await resolveApprovalChannel({ workflow, approvalNodeId });
  const messageTemplate = getApprovalMessageTemplate(workflow, approvalNodeId);
  if (!target) return;

  const base = formatApprovalPacketMessage(workflow, run, approvalNodeId);
  const message = messageTemplate
    ? `${applyTemplate(messageTemplate, {
        workflowName: workflow.name || workflow.id,
        workflowId: workflow.id,
        runId: run.id,
        nodeId: approvalNodeId,
      })}\n\n${base}`
    : base;

  // Best-effort: message delivery failures should not block file-first persistence.
  await toolsInvoke({
    tool: "message",
    args: {
      action: "send",
      channel: provider,
      target,
      message,
    },
  });

  // Writeback of delivery info happens in the caller (so we can record errors too).
  // eslint-disable-next-line sonarjs/void-use -- intentional no-op to satisfy param
  void teamId;
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
  const runIdFromBody = String(o.runId ?? "").trim();
  const note = typeof o.note === "string" ? o.note : undefined;
  const decidedBy = typeof o.decidedBy === "string" ? o.decidedBy : undefined;

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
        } catch {
          // ignore; keep file-first decision recorded
        }
      }

      return jsonOkRest({ ...(await writeWorkflowRun(teamId, workflowId, finalRun)), runId: run.id });
    }

    // Create mode
    const runId = `run-${nowIso().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`.toLowerCase();

    const run: WorkflowRunFileV1 =
      mode === "sample"
        ? await (async () => {
            const wf = (await readWorkflow(teamId, workflowId)).workflow;
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
              const { provider, target } = await resolveApprovalChannel({ workflow: wf, approvalNodeId });

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
        : {
            schema: "clawkitchen.workflow-run.v1",
            id: runId,
            workflowId,
            startedAt: nowIso(),
            status: "running",
            summary: "Run created (execution engine not yet wired)",
            nodes: [],
          };

    return jsonOkRest({ ...(await writeWorkflowRun(teamId, workflowId, run)), runId });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 500 });
  }
}
