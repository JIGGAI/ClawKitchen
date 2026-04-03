"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import type { WorkflowFileV1 } from "@/lib/workflows/types";
import { validateWorkflowFileV1 } from "@/lib/workflows/validate";
import { getMediaNodeConfig, isMediaNode, type MediaGenerationConfig } from "@/lib/workflows/media-nodes";
import { MediaGenerationConfigComponent } from "@/components/media/MediaGenerationConfig";

// Helper function to collect upstream variables for template insertion
function getUpstreamVariables(
  wf: WorkflowFileV1, 
  nodeId: string
): Array<{nodeId: string, nodeName: string, fieldName: string, fieldType: string}> {
  const variables: Array<{nodeId: string, nodeName: string, fieldName: string, fieldType: string}> = [];
  
  // BFS backwards from nodeId to find all upstream ancestors
  const upstream = new Set<string>();
  const queue = [nodeId];
  const visited = new Set<string>();
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    for (const edge of (wf.edges ?? [])) {
      if (edge.to === currentId && !upstream.has(edge.from) && edge.from !== nodeId) {
        upstream.add(edge.from);
        queue.push(edge.from);
      }
    }
  }
  
  // For each upstream node, collect its output fields + standard outputs
  for (const upstreamId of upstream) {
    const upstreamNode = wf.nodes.find(n => n.id === upstreamId);
    if (!upstreamNode) continue;
    
    const nodeName = upstreamNode.name || upstreamId;
    const config = upstreamNode.config && typeof upstreamNode.config === 'object' && !Array.isArray(upstreamNode.config) ? upstreamNode.config as Record<string, unknown> : {};
    
    // Always include standard outputs for every upstream node
    variables.push(
      { nodeId: upstreamId, nodeName, fieldName: 'output', fieldType: 'text' },
      { nodeId: upstreamId, nodeName, fieldName: 'text', fieldType: 'text' }
    );
    
    // Include declared output fields if they exist
    const outputFields = config.outputFields as Array<{name: string, type: string}> | undefined;
    if (Array.isArray(outputFields)) {
      for (const field of outputFields) {
        if (field.name?.trim()) {
          variables.push({
            nodeId: upstreamId,
            nodeName,
            fieldName: field.name.trim(),
            fieldType: field.type || 'text'
          });
        }
      }
    }
  }
  
  return variables;
}

// Variable insertion dropdown component
function VariableInsertDropdown({
  targetTextareaRef,
  workflow,
  currentNodeId,
  onInsert
}: {
  targetTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  workflow: WorkflowFileV1;
  currentNodeId: string;
  onInsert?: (variable: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const variables = useMemo(() => getUpstreamVariables(workflow, currentNodeId), [workflow, currentNodeId]);

  // Always-available globals (these work across node types)
  const globalVariables = useMemo(
    () => [
      { variable: "{{run.id}}", type: "text" },
      { variable: "{{workflow.name}}", type: "text" },
      { variable: "{{workflow.id}}", type: "text" },
      { variable: "{{node.id}}", type: "text" },
      { variable: "{{date}}", type: "text" },
    ],
    []
  );
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);
  
  const insertVariable = (variable: string) => {
    const textarea = targetTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = textarea.value;
      const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
      
      // Use the onInsert callback to update the parent component's state
      if (onInsert) {
        onInsert(newValue);
        
        // Set cursor position after the inserted variable
        setTimeout(() => {
          textarea.focus();
          const newCursorPos = start + variable.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
      }
    }
    setIsOpen(false);
  };
  
  // Group variables by node
  const groupedVariables = variables.reduce((groups, variable) => {
    const key = `${variable.nodeId}|${variable.nodeName}`;
    if (!groups[key]) {
      groups[key] = { nodeId: variable.nodeId, nodeName: variable.nodeName, fields: [] };
    }
    groups[key].fields.push({ name: variable.fieldName, type: variable.fieldType });
    return groups;
  }, {} as Record<string, { nodeId: string; nodeName: string; fields: Array<{ name: string; type: string }> }>);
  
  return (
    <div className="absolute top-1 right-1" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-[9px] text-[color:var(--ck-text-secondary)] hover:bg-white/10 hover:text-[color:var(--ck-text-primary)]"
        title="Insert variable"
      >
        {'{{}}'}
      </button>
      
      {isOpen && (
        <div className="absolute right-0 top-8 z-50 w-72 max-h-80 overflow-auto rounded-[var(--ck-radius-sm)] border border-white/15 bg-black/80 backdrop-blur shadow-[var(--ck-shadow-1)]">
          <div className="p-1">
            <div>
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                Globals
              </div>
              {globalVariables.map(({ variable, type }) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => insertVariable(variable)}
                  className="w-full flex items-center justify-between gap-2 rounded-[var(--ck-radius-sm)] px-2 py-1 text-left text-xs text-[color:var(--ck-text-primary)] hover:bg-white/10 cursor-pointer"
                >
                  <span className="font-mono">{variable}</span>
                  <span className="text-[9px] px-1 py-0.5 rounded-sm bg-black/30 text-blue-400">
                    {type}
                  </span>
                </button>
              ))}
            </div>

            {Object.values(groupedVariables).map(group => (
              <div key={group.nodeId}>
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                  {group.nodeName}
                </div>
                {group.fields.map(field => {
                  const variable = `{{${group.nodeId}.${field.name}}}`;
                  const badgeColor = field.type === 'text' ? 'text-blue-400' : 
                                   field.type === 'list' ? 'text-green-400' : 
                                   field.type === 'json' ? 'text-amber-400' : 'text-gray-400';
                  
                  return (
                    <button
                      key={`${group.nodeId}.${field.name}`}
                      type="button"
                      onClick={() => insertVariable(variable)}
                      className="w-full flex items-center justify-between gap-2 rounded-[var(--ck-radius-sm)] px-2 py-1 text-left text-xs text-[color:var(--ck-text-primary)] hover:bg-white/10 cursor-pointer"
                    >
                      <span className="font-mono">{variable}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded-sm bg-black/30 ${badgeColor}`}>
                        {field.type}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            
            {variables.length === 0 && (
              <div className="px-2 py-3 text-xs text-[color:var(--ck-text-secondary)]">
                Tip: Add output fields to upstream nodes to see node-specific variables here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateTextareaWithVars({
  value,
  onChangeValue,
  workflow,
  currentNodeId,
  className,
  placeholder,
  spellCheck,
}: {
  value: string;
  onChangeValue: (next: string) => void;
  workflow: WorkflowFileV1;
  currentNodeId: string;
  className: string;
  placeholder?: string;
  spellCheck?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChangeValue(e.target.value)}
        className={className}
        placeholder={placeholder}
        spellCheck={spellCheck}
      />
      <VariableInsertDropdown
        targetTextareaRef={ref}
        workflow={workflow}
        currentNodeId={currentNodeId}
        onInsert={(newValue) => onChangeValue(newValue)}
      />
    </div>
  );
}

// Output fields editor component for all node types
function OutputFieldsEditor({
  outputFields,
  onChange
}: {
  outputFields: OutputField[];
  onChange: (fields: OutputField[]) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
        output fields (optional)
      </div>
      <div className="text-[9px] text-[color:var(--ck-text-secondary)] mb-2">
        Define what this node produces for downstream nodes
      </div>
      <div className="space-y-1">
        {outputFields.map((field, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={field.name}
              onChange={(e) => {
                const newOutputFields = [...outputFields];
                newOutputFields[index] = { ...field, name: e.target.value };
                onChange(newOutputFields);
              }}
              className="flex-1 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
              placeholder="Field name"
            />
            <select
              value={field.type}
              onChange={(e) => {
                const newType = e.target.value as OutputFieldType;
                const newOutputFields = [...outputFields];
                newOutputFields[index] = { ...field, type: newType };
                onChange(newOutputFields);
              }}
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
            >
              <option value="text">text</option>
              <option value="list">list</option>
              <option value="json">json</option>
            </select>
            <button
              type="button"
              onClick={() => {
                const newOutputFields = outputFields.filter((_, i) => i !== index);
                onChange(newOutputFields);
              }}
              className="text-xs text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-primary)]"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const newOutputFields = [...outputFields, { name: "", type: "text" as const }];
            onChange(newOutputFields);
          }}
          className="text-xs text-[color:var(--ck-text-secondary)] hover:text-[color:var(--ck-text-primary)]"
        >
          + Add field
        </button>
      </div>
    </div>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | { kind: "ready"; jsonText: string };

type OutputFieldType = "text" | "list" | "json";
type OutputField = { name: string; type: OutputFieldType };

function draftKey(teamId: string, workflowId: string) {
  return `ck-wf-draft:${teamId}:${workflowId}`;
}

export default function WorkflowsEditorClient({
  teamId,
  workflowId,
  draft,
  llmTaskEnabled,
}: {
  teamId: string;
  workflowId: string;
  draft: boolean;
  llmTaskEnabled?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"canvas" | "json">("canvas");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<LoadState>({ kind: "loading" });
  const [actionError, setActionError] = useState<string>("");
  const [triggerSyncStatus, setTriggerSyncStatus] = useState<"idle" | "syncing" | "success" | "error">(
    "idle"
  );
  const [triggerSyncError, setTriggerSyncError] = useState<string>("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [toolsCollapsed, setToolsCollapsed] = useState(false);

  // Canvas zoom
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.1;

  // Canvas: selection, drag, node/edge creation.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [dragging, setDragging] = useState<null | { nodeId: string; dx: number; dy: number }>(null);

  const [activeTool, setActiveTool] = useState<
    | { kind: "select" }
    | { kind: "add-node"; nodeType: WorkflowFileV1["nodes"][number]["type"] }
    | { kind: "connect" }
  >({ kind: "select" });
  const [connectFromNodeId, setConnectFromNodeId] = useState<string>("");

  const [agents, setAgents] = useState<Array<{ id: string; identityName?: string }>>([]);
  const [agentsError, setAgentsError] = useState<string>("");

  const [approvalBindings, setApprovalBindings] = useState<Array<{ id: string; label: string; channel: string; target: string }>>([]);
  const [approvalBindingsError, setApprovalBindingsError] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableModelsError, setAvailableModelsError] = useState<string>("");
  const [showRawConfig, setShowRawConfig] = useState<Record<string, boolean>>({});

  const approvalBindingsNeedsKitchenUpdate = useMemo(() => {
    return /Tool not available:\s*gateway/i.test(String(approvalBindingsError || ""));
  }, [approvalBindingsError]);

  // Inspector state (parity with modal)
  const [workflowRuns, setWorkflowRuns] = useState<string[]>([]);
  const [workflowRunsLoading, setWorkflowRunsLoading] = useState(false);
  const [workflowRunsError, setWorkflowRunsError] = useState("");
  const [selectedWorkflowRunId, setSelectedWorkflowRunId] = useState<string>("");

  // Run preflight: ensure nodes are assigned + required worker cron exists.
  const [cronLoading, setCronLoading] = useState(false);
  const [cronError, setCronError] = useState<string>("");
  const [agentHasCron, setAgentHasCron] = useState<Record<string, boolean>>({});

  const [installCronOpen, setInstallCronOpen] = useState(false);
  const [installCronBusy, setInstallCronBusy] = useState(false);
  const [installCronError, setInstallCronError] = useState<string>("");

  const [newNodeId, setNewNodeId] = useState("");
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeType, setNewNodeType] = useState<WorkflowFileV1["nodes"][number]["type"]>("llm");

  const [newEdgeFrom, setNewEdgeFrom] = useState("");
  const [newEdgeTo, setNewEdgeTo] = useState("");
  const [newEdgeLabel, setNewEdgeLabel] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (draft) {
          const stored = sessionStorage.getItem(draftKey(teamId, workflowId));
          if (stored) {
            setStatus({ kind: "ready", jsonText: stored });
            return;
          }

          // New draft: initialize a clean workflow instead of trying to fetch an existing file.
          const initial: WorkflowFileV1 = {
            schema: "clawkitchen.workflow.v1",
            id: workflowId,
            name: "New workflow",
            timezone: "UTC",
            nodes: [
              { id: "start", type: "start", name: "start", x: 80, y: 80, config: {} },
              { id: "end", type: "end", name: "end", x: 520, y: 80, config: {} },
            ],
            edges: [{ id: "e1", from: "start", to: "end" }],
          };
          const text = JSON.stringify(initial, null, 2) + "\n";
          setStatus({ kind: "ready", jsonText: text });
          try {
            sessionStorage.setItem(draftKey(teamId, workflowId), text);
          } catch {
            // ignore
          }
          return;
        }

        const res = await fetch(
          `/api/teams/workflows?teamId=${encodeURIComponent(teamId)}&id=${encodeURIComponent(workflowId)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as { ok?: boolean; error?: string; workflow?: unknown };
        if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load workflow");
        setStatus({ kind: "ready", jsonText: JSON.stringify(json.workflow, null, 2) + "\n" });
      } catch (e: unknown) {
        setStatus({ kind: "error", error: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [teamId, workflowId, draft]);

  useEffect(() => {
    (async () => {
      setAgentsError("");
      try {
        const res = await fetch("/api/agents", { cache: "no-store" });
        const json = (await res.json()) as { agents?: Array<{ id?: unknown; identityName?: unknown }>; error?: string; message?: string };
        if (!res.ok) throw new Error(json.error || json.message || "Failed to load agents");
        const list = Array.isArray(json.agents) ? json.agents : [];
        const filtered = list
          .map((a) => ({ id: String(a.id ?? "").trim(), identityName: typeof a.identityName === "string" ? a.identityName : undefined }))
          .filter((a) => a.id && a.id.startsWith(`${teamId}-`));
        setAgents(filtered);
      } catch (e: unknown) {
        setAgentsError(e instanceof Error ? e.message : String(e));
        setAgents([]);
      }
    })();
  }, [teamId]);

  function isRecord(v: unknown): v is Record<string, unknown> {
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
  }

  function bindingLabelAndTarget(b: unknown): { id: string; label: string; channel: string; target: string } | null {
    // Expected OpenClaw binding shape:
    // { agentId, match: { channel: "telegram", accountId?: string, peer?: { kind: "dm"|"group", id: string } } }
    if (!isRecord(b)) return null;
    const match = isRecord(b.match) ? b.match : null;
    if (!match) return null;

    const channel = String(match.channel ?? "").trim();
    if (!channel) return null;

    const bindingAgentId = String(b.agentId ?? "").trim();
    const accountId = String(match.accountId ?? "").trim();
    const peer = isRecord(match.peer) ? match.peer : null;
    const kind = peer ? String(peer.kind ?? "").trim() : "";
    const peerId = peer ? String(peer.id ?? "").trim() : "";
    const target = peerId || accountId;

    if (!target) return null;

    // approvalBindingId must be the actual config binding id (agentId) when available.
    // Older Kitchen builds synthesized ids like telegram:dm:<peer> or telegram:account:<id>,
    // which can be ambiguous and break approval resolution when multiple bindings share a peer.
    const id = bindingAgentId || (accountId ? `${channel}:account:${accountId}` : `${channel}:${kind}:${peerId}`);

    const parts = [channel];
    if (bindingAgentId) parts.push(bindingAgentId);
    if (accountId) parts.push(`account:${accountId}`);
    if (kind && peerId) parts.push(`${kind}:${peerId}`);

    return { id, label: parts.join(" · "), channel, target };
  }

  useEffect(() => {
    (async () => {
      setApprovalBindingsError("");
      try {
        const res = await fetch("/api/channels/bindings", { cache: "no-store" });
        const json = (await res.json()) as { ok?: boolean; bindings?: unknown[]; error?: string };
        if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load bindings");

        const list = Array.isArray(json.bindings) ? json.bindings : [];
        const mapped = list.map(bindingLabelAndTarget).filter(Boolean) as Array<{ id: string; label: string; channel: string; target: string }>;
        setApprovalBindings(mapped);
      } catch (e: unknown) {
        setApprovalBindingsError(e instanceof Error ? e.message : String(e));
        setApprovalBindings([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setAvailableModelsError("");
      try {
        const res = await fetch("/api/settings/model-options", { cache: "no-store" });
        const json = (await res.json()) as { ok?: boolean; models?: unknown[]; error?: string };
        if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load model options");

        const deduped = Array.isArray(json.models)
          ? Array.from(new Set(json.models.map((m) => String(m ?? "").trim()).filter(Boolean)))
          : [];
        setAvailableModels(deduped);
      } catch (e: unknown) {
        setAvailableModelsError(e instanceof Error ? e.message : String(e));
        setAvailableModels([]);
      }
    })();
  }, []);

  const refreshCronMap = useCallback(async (): Promise<Record<string, boolean>> => {
    // Preflight helper: determine whether each workflow-assigned agent has a
    // workflow worker-tick cron installed and enabled.  Safe-idle or other
    // generic crons do NOT satisfy this requirement — only crons whose name
    // starts with "workflow-worker:" or whose payload message contains
    // "worker-tick" count.
    setCronError("");
    setCronLoading(true);
    try {
      const res = await fetch("/api/cron/jobs", { cache: "no-store" });
      const json = (await res.json()) as { ok?: boolean; error?: string; jobs?: unknown[] };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to load cron jobs");
      const jobs = Array.isArray(json.jobs) ? json.jobs : [];

      const map: Record<string, boolean> = {};
      for (const j of jobs) {
        const job = j as {
          enabled?: unknown;
          name?: unknown;
          agentId?: unknown;
          payload?: { message?: unknown; kind?: unknown };
          scope?: { kind?: unknown; id?: unknown };
        };
        if (!job || !Boolean(job.enabled)) continue;

        // Only match workflow worker-tick crons, not safe-idle or other agent crons.
        const jobName = String(job.name ?? "");
        const payloadMsg = String(job.payload?.message ?? "");
        const isWorkerTick = jobName.startsWith("workflow-worker:") || payloadMsg.includes("worker-tick");
        if (!isWorkerTick) continue;

        // Worker-tick crons run as agentId "main" but reference the target
        // agent in the name (workflow-worker:<teamId>:<agentId>) and message.
        // Extract the target agent from the name or payload.
        const nameMatch = jobName.match(/^workflow-worker:[^:]+:(.+)$/);
        if (nameMatch?.[1]) {
          map[nameMatch[1]] = true;
          continue;
        }

        // Fallback: extract from payload message pattern "worker-tick ... --agent-id <id>"
        const msgMatch = payloadMsg.match(/--agent-id\s+(\S+)/);
        if (msgMatch?.[1]) {
          map[msgMatch[1]] = true;
          continue;
        }

        // Last resort: if the cron runs as a non-main agent, use that.
        const agentId = String(job.agentId ?? "").trim();
        if (agentId && agentId !== "main") {
          map[agentId] = true;
        }
      }
      setAgentHasCron(map);
      return map;
    } catch (e: unknown) {
      setCronError(e instanceof Error ? e.message : String(e));
      setAgentHasCron({});
      return {};
    } finally {
      setCronLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCronMap();
  }, [refreshCronMap]);

  const parsed = useMemo(() => {
    if (status.kind !== "ready") return { wf: null as WorkflowFileV1 | null, err: "" };
    try {
      const wf = JSON.parse(status.jsonText) as WorkflowFileV1;
      return { wf, err: "" };
    } catch (e: unknown) {
      return { wf: null, err: e instanceof Error ? e.message : String(e) };
    }
  }, [status]);

  const validation = useMemo(() => {
    if (!parsed.wf) return { errors: [], warnings: [] as string[] };
    return validateWorkflowFileV1(parsed.wf);
  }, [parsed.wf]);

  const runPreflight = useMemo(() => {
    const wf = parsed.wf;
    if (!wf) {
      return {
        missingAgentOnNodeIds: [] as string[],
        requiredAgentIds: [] as string[],
        agentIdsMissingCron: [] as string[],
        ok: true,
      };
    }

    const nodesToExecute = (wf.nodes ?? []).filter(
      (n) => n.type !== "start" && n.type !== "end" && n.type !== "human_approval"
    );

    const missingAgentOnNodeIds = nodesToExecute
      .filter((n) => {
        const cfg = n.config && typeof n.config === "object" && !Array.isArray(n.config) ? (n.config as Record<string, unknown>) : {};
        const agentId = String(cfg.agentId ?? "").trim();
        return !agentId;
      })
      .map((n) => n.id);

    const requiredAgentIds = Array.from(
      new Set(
        nodesToExecute
          .map((n) => {
            const cfg = n.config && typeof n.config === "object" && !Array.isArray(n.config) ? (n.config as Record<string, unknown>) : {};
            return String(cfg.agentId ?? "").trim();
          })
          .filter(Boolean)
      )
    );

    const agentIdsMissingCron = requiredAgentIds.filter((id) => !agentHasCron[id]);

    const ok = missingAgentOnNodeIds.length === 0 && agentIdsMissingCron.length === 0;
    return { missingAgentOnNodeIds, requiredAgentIds, agentIdsMissingCron, ok };
  }, [parsed.wf, agentHasCron]);

  function setWorkflow(next: WorkflowFileV1) {
    const text = JSON.stringify(next, null, 2) + "\n";
    setStatus({ kind: "ready", jsonText: text });
    if (draft) {
      try {
        sessionStorage.setItem(draftKey(teamId, workflowId), text);
      } catch {
        // ignore
      }
    }
  }

  async function onSave() {
    if (status.kind !== "ready") return;
    if (!parsed.wf) return;
    if (parsed.err) return;
    if (validation.errors.length) return;

    setSaving(true);
    setActionError("");
    setTriggerSyncStatus("idle");
    setTriggerSyncError("");
    
    try {
      // Save workflow first
      const res = await fetch("/api/teams/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, workflow: parsed.wf }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save workflow");

      // Clear draft cache once persisted.
      try {
        sessionStorage.removeItem(draftKey(teamId, workflowId));
      } catch {
        // ignore
      }

      // Sync triggers (don't block save flow on trigger sync errors)
      if (parsed.wf.triggers?.length) {
        try {
          setTriggerSyncStatus("syncing");
          const triggerRes = await fetch("/api/teams/workflow-triggers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "sync",
              teamId,
              workflowId: parsed.wf.id,
              triggers: parsed.wf.triggers ?? [],
            }),
          });
          const triggerJson = (await triggerRes.json()) as { ok?: boolean; error?: string };
          
          if (triggerRes.ok && triggerJson.ok) {
            setTriggerSyncStatus("success");
            // Clear success status after 3 seconds
            setTimeout(() => setTriggerSyncStatus("idle"), 3000);
          } else {
            setTriggerSyncStatus("error");
            setTriggerSyncError(triggerJson.error || "Failed to sync triggers");
          }
        } catch (e: unknown) {
          setTriggerSyncStatus("error");
          setTriggerSyncError(e instanceof Error ? e.message : "Failed to sync triggers");
        }
      }
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function onExport() {
    if (!parsed.wf) return;
    if (parsed.err) return;
    if (validation.errors.length) return;

    const filename = `${parsed.wf.id || workflowId}.workflow.json`;
    const blob = new Blob([JSON.stringify(parsed.wf, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (status.kind === "loading") return <div className="ck-glass w-full p-6">Loading…</div>;
  if (status.kind === "error") return <div className="ck-glass w-full p-6">{status.error}</div>;

  // (section collapse uses native <details> to keep this file simple)
  const llmHelp = llmTaskEnabled === false ? (
    <div className="mx-3 mb-3 rounded-[var(--ck-radius-sm)] border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <div className="font-medium text-amber-200">LLM support is not enabled</div>
      <div className="mt-1 text-[color:var(--ck-text-secondary)]">
        Workflow LLM nodes require the optional built-in <code className="px-1">llm-task</code> plugin.
      </div>
      <div className="mt-2 text-[color:var(--ck-text-secondary)]">
        Enable it with: <code className="px-1">openclaw plugins enable llm-task</code> then run{' '}
        <code className="px-1">openclaw gateway restart</code>.
      </div>
    </div>
  ) : null;


  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <a
            href={`/teams/${encodeURIComponent(teamId)}?tab=workflows`}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
          >
            Back
          </a>
          <div className="min-w-0">
            <div className="truncate text-base font-medium text-[color:var(--ck-text-primary)]">
              {workflowId}.workflow.json
            </div>
            <div className="mt-0.5 text-sm text-[color:var(--ck-text-tertiary)]">Team: {teamId}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-[var(--ck-radius-sm)] border border-white/10">
            <button
              type="button"
              onClick={() => setView("canvas")}
              className={
                view === "canvas"
                  ? "bg-white/10 px-3 py-2 text-xs font-medium text-[color:var(--ck-text-primary)]"
                  : "bg-transparent px-3 py-2 text-xs font-medium text-[color:var(--ck-text-secondary)] hover:bg-white/5"
              }
            >
              Canvas
            </button>
            <button
              type="button"
              onClick={() => setView("json")}
              className={
                view === "json"
                  ? "bg-white/10 px-3 py-2 text-xs font-medium text-[color:var(--ck-text-primary)]"
                  : "bg-transparent px-3 py-2 text-xs font-medium text-[color:var(--ck-text-secondary)] hover:bg-white/5"
              }
            >
              JSON
            </button>
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              // Reset the input so re-importing the same file still triggers onChange.
              e.target.value = "";
              if (!file) return;

              setActionError("");
              try {
                const text = await file.text();
                const next = JSON.parse(text) as WorkflowFileV1;
                setStatus({ kind: "ready", jsonText: JSON.stringify(next, null, 2) + "\n" });
                if (draft) {
                  try {
                    sessionStorage.setItem(draftKey(teamId, workflowId), JSON.stringify(next, null, 2) + "\n");
                  } catch {
                    // ignore
                  }
                }
              } catch (err: unknown) {
                setActionError(err instanceof Error ? err.message : String(err));
              }
            }}
          />

          <button
            type="button"
            disabled={saving}
            onClick={() => importInputRef.current?.click()}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] hover:bg-white/10 disabled:opacity-50"
          >
            Import
          </button>

          <button
            type="button"
            disabled={!parsed.wf || Boolean(parsed.err) || validation.errors.length > 0}
            onClick={onExport}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] hover:bg-white/10 disabled:opacity-50"
          >
            Export
          </button>

          <button
            type="button"
            disabled={saving || !parsed.wf || Boolean(parsed.err) || validation.errors.length > 0}
            onClick={onSave}
            className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>

          {/* Back button lives in the left header. */}
        </div>
      </div>

      {llmHelp}

      {parsed.err ? (
        <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-yellow-400/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
          JSON parse error: {parsed.err}
        </div>
      ) : null}
      {!parsed.err && validation.errors.length ? (
        <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
          <div className="font-medium">Workflow validation errors</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {validation.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!parsed.err && !validation.errors.length && validation.warnings.length ? (
        <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-yellow-400/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
          <div className="font-medium">Workflow validation warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {validation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {actionError ? (
        <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
          {actionError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-0">
        {view === "json" ? (
          <textarea
            value={status.jsonText}
            onChange={(e) => {
              const t = e.target.value;
              setStatus({ kind: "ready", jsonText: t });
              if (draft) {
                try {
                  sessionStorage.setItem(draftKey(teamId, workflowId), t);
                } catch {
                  // ignore
                }
              }
            }}
            className="h-full min-h-0 w-full flex-1 resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
          />
        ) : (
          <div
            ref={canvasRef}
            className="relative h-full min-h-0 w-full flex-1 overflow-auto bg-black/20"
            onWheel={(e) => {
              // Ctrl/Cmd + wheel to zoom (avoid hijacking normal scroll)
              if (!e.ctrlKey && !e.metaKey) return;
              e.preventDefault();
              const dir = e.deltaY > 0 ? -1 : 1;
              setZoom((z) => {
                const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((z + dir * ZOOM_STEP) * 10) / 10));
                return next;
              });
            }}
            onClick={(e) => {
              if (activeTool.kind !== "add-node") return;
              const wf = parsed.wf;
              if (!wf) return;
              const el = canvasRef.current;
              if (!el) return;

              // Only create when clicking on the canvas background (not a node).
              const target = e.target as HTMLElement | null;
              if (target && target.closest("[data-wf-node='1']")) return;

              const rect = el.getBoundingClientRect();
              const clickX = (e.clientX - rect.left + el.scrollLeft) / zoom;
              const clickY = (e.clientY - rect.top + el.scrollTop) / zoom;

              const base = activeTool.nodeType.replace(/[^a-z0-9_\-]/gi, "_");
              const used = new Set(wf.nodes.map((n) => n.id));
              let i = 1;
              let id = `${base}_${i}`;
              while (used.has(id)) {
                i++;
                id = `${base}_${i}`;
              }

              const x = Math.max(0, clickX - 90);
              const y = Math.max(0, clickY - 24);

              const defaultConfig = isMediaNode(activeTool.nodeType) 
                ? getMediaNodeConfig(activeTool.nodeType)
                : {};

              const nextNode: WorkflowFileV1["nodes"][number] = {
                id,
                type: activeTool.nodeType,
                name: id,
                x,
                y,
                config: defaultConfig,
              };

              setWorkflow({ ...wf, nodes: [...wf.nodes, nextNode] });
              setSelectedNodeId(id);
              setActiveTool({ kind: "select" });
            }}
          >
            <div className="relative" style={{ width: 2200 * zoom, height: 1200 * zoom }}>
              {/* Tool palette / agent palette (not scaled) */}
              <div
                className={
                  toolsCollapsed
                    ? "absolute left-3 top-3 z-20 w-[44px] overflow-hidden rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/40 p-2 backdrop-blur"
                    : "absolute left-3 top-3 z-20 w-[260px] rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/40 p-2 backdrop-blur"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className={toolsCollapsed ? "hidden" : "text-[10px] font-medium uppercase tracking-wide text-[color:var(--ck-text-tertiary)]"}>Tools</div>
                  <div className="flex items-center gap-2">
                    <div className={toolsCollapsed ? "hidden" : "flex items-center gap-1"}>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10))}
                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                        title="Zoom out (Ctrl/Cmd+wheel)"
                      >
                        -
                      </button>
                      <div className="min-w-[42px] text-center text-[10px] text-[color:var(--ck-text-tertiary)]">{Math.round(zoom * 100)}%</div>
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10))}
                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                        title="Zoom in (Ctrl/Cmd+wheel)"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setToolsCollapsed((v) => !v)}
                      className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                      title={toolsCollapsed ? "Expand" : "Collapse"}
                    >
                      {toolsCollapsed ? ">" : "<"}
                    </button>
                  </div>
                </div>
                {toolsCollapsed ? (
                  <div className="mt-2 flex flex-col items-center gap-2">
                    {(
                      [
                        {
                          key: "select",
                          label: "Select",
                          active: activeTool.kind === "select",
                          onClick: () => {
                            setActiveTool({ kind: "select" });
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M5 4l7 16 2-7 7-2L5 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                            </svg>
                          ),
                        },
                        {
                          key: "connect",
                          label: "Connect",
                          active: activeTool.kind === "connect",
                          onClick: () => {
                            // Toggle connect tool.
                            setActiveTool((t) => (t.kind === "connect" ? { kind: "select" } : { kind: "connect" }));
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M10 13a5 5 0 0 1 0-7l1.2-1.2a5 5 0 0 1 7 7L17 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                              <path d="M14 11a5 5 0 0 1 0 7L12.8 19.2a5 5 0 1 1-7-7L7 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          ),
                        },
                        {
                          key: "llm",
                          label: "LLM",
                          active: activeTool.kind === "add-node" && activeTool.nodeType === "llm",
                          onClick: () => {
                            setActiveTool({ kind: "add-node", nodeType: "llm" });
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                            </svg>
                          ),
                        },
                        {
                          key: "tool",
                          label: "Tool",
                          active: activeTool.kind === "add-node" && activeTool.nodeType === "tool",
                          onClick: () => {
                            setActiveTool({ kind: "add-node", nodeType: "tool" });
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M14.5 7.5l2 2-8.5 8.5H6v-2l8.5-8.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                              <path d="M12 6a4 4 0 0 0-5 5l3-3 2 2 3-3A4 4 0 0 0 12 6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                            </svg>
                          ),
                        },
                        {
                          key: "condition",
                          label: "If",
                          active: activeTool.kind === "add-node" && activeTool.nodeType === "condition",
                          onClick: () => {
                            setActiveTool({ kind: "add-node", nodeType: "condition" });
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M7 4v7a3 3 0 0 0 3 3h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                              <path d="M17 10l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ),
                        },
                        {
                          key: "delay",
                          label: "Delay",
                          active: activeTool.kind === "add-node" && activeTool.nodeType === "delay",
                          onClick: () => {
                            setActiveTool({ kind: "add-node", nodeType: "delay" });
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M21 12a9 9 0 1 1-9-9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          ),
                        },
                        {
                          key: "approval",
                          label: "Approval",
                          active: activeTool.kind === "add-node" && activeTool.nodeType === "human_approval",
                          onClick: () => {
                            setActiveTool({ kind: "add-node", nodeType: "human_approval" });
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ),
                        },
                        {
                          key: "end",
                          label: "End",
                          active: activeTool.kind === "add-node" && activeTool.nodeType === "end",
                          onClick: () => {
                            setActiveTool({ kind: "add-node", nodeType: "end" });
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M7 7h10v10H7V7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                            </svg>
                          ),
                        },
                        {
                          key: "media-image",
                          label: "Image",
                          active: activeTool.kind === "add-node" && activeTool.nodeType === "media-image",
                          onClick: () => {
                            setActiveTool({ kind: "add-node", nodeType: "media-image" });
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M14.5 4h-5L7 6.5 4.5 9v6L7 17.5 9.5 20h5L17 17.5 19.5 15V9L17 6.5 14.5 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                              <path d="M9 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
                              <path d="m4.5 15 3.5-3.5L11 14l3.5-3.5 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ),
                        },
                        {
                          key: "media-video",
                          label: "Video",
                          active: activeTool.kind === "add-node" && activeTool.nodeType === "media-video",
                          onClick: () => {
                            setActiveTool({ kind: "add-node", nodeType: "media-video" });
                            setConnectFromNodeId("");
                          },
                          icon: (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M10 12l4.5 2.5-4.5 2.5v-5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ),
                        },
                      ] as const
                    ).map((b) => (
                      <button
                        key={b.key}
                        type="button"
                        onClick={b.onClick}
                        className={
                          b.active
                            ? "flex h-8 w-8 items-center justify-center rounded-[var(--ck-radius-sm)] bg-white/10 text-[color:var(--ck-text-primary)]"
                            : "flex h-8 w-8 items-center justify-center rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                        }
                        title={b.label}
                        aria-label={b.label}
                      >
                        {b.icon}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTool({ kind: "select" });
                        setConnectFromNodeId("");
                      }}
                      className={
                        activeTool.kind === "select"
                          ? "rounded-[var(--ck-radius-sm)] bg-white/10 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                          : "rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                      }
                    >
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTool({ kind: "connect" });
                        setConnectFromNodeId("");
                      }}
                      className={
                        activeTool.kind === "connect"
                          ? "rounded-[var(--ck-radius-sm)] bg-white/10 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                          : "rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                      }
                      title="Click a node, then click another node to create an edge"
                    >
                      Connect
                    </button>

                    {([
                      { t: "llm", label: "LLM" },
                      { t: "tool", label: "Tool" },
                      { t: "condition", label: "If" },
                      { t: "delay", label: "Delay" },
                      { t: "human_approval", label: "Approve" },
                      { t: "media-image", label: "🎨 Image" },
                      { t: "media-video", label: "🎬 Video" },
                      { t: "end", label: "End" },
                    ] as Array<{ t: WorkflowFileV1["nodes"][number]["type"]; label: string }>).map((x) => (
                      <button
                        key={x.t}
                        type="button"
                        onClick={() => {
                          setActiveTool({ kind: "add-node", nodeType: x.t });
                          setConnectFromNodeId("");
                        }}
                        className={
                          activeTool.kind === "add-node" && activeTool.nodeType === x.t
                            ? "rounded-[var(--ck-radius-sm)] bg-white/10 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                            : "rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                        }
                        title="Select tool, then click on the canvas to place"
                      >
                        + {x.label}
                      </button>
                    ))}
                  </div>
                )}

                {!toolsCollapsed && activeTool.kind === "connect" && connectFromNodeId ? (
                  <div className="mt-2 text-xs text-[color:var(--ck-text-secondary)]">Connecting from: <span className="font-mono">{connectFromNodeId}</span></div>
                ) : null}
                {!toolsCollapsed && activeTool.kind === "add-node" ? (
                  <div className="mt-2 text-xs text-[color:var(--ck-text-secondary)]">Click on the canvas to place a <span className="font-mono">{activeTool.nodeType}</span> node.</div>
                ) : null}

                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className={toolsCollapsed ? "hidden" : "flex items-center justify-between gap-2"}>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">Agents</div>
                    <div className="text-[10px] text-[color:var(--ck-text-tertiary)]">drag → node</div>
                  </div>

                  {toolsCollapsed ? (
                    <button
                      type="button"
                      onClick={() => setToolsCollapsed(false)}
                      className="mt-2 flex h-8 w-8 items-center justify-center rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                      title="Expand to see agents"
                      aria-label="Expand to see agents"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                        <path d="M16 11a4 4 0 1 0-8 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M4 20a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  ) : (
                    <>
                      {agentsError ? <div className="mt-1 text-[11px] text-red-200">{agentsError}</div> : null}
                      <div className="mt-2 max-h-[140px] space-y-1 overflow-auto">
                        {agents.length ? (
                          agents.map((a) => (
                            <div
                              key={a.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", a.id);
                                e.dataTransfer.effectAllowed = "copy";
                              }}
                              className="cursor-grab rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                              title={a.id}
                            >
                              {a.identityName ? a.identityName : a.id.replace(`${teamId}-`, "")}
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-[color:var(--ck-text-tertiary)]">No team agents found.</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="relative h-[1200px] w-[2200px]" style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
              <svg
                className="pointer-events-none absolute inset-0 -z-10"
                width={2200}
                height={1200}
                style={{ overflow: "visible" }}
              >
                {(parsed.wf?.edges ?? []).map((e) => {
                  const wf = parsed.wf;
                  if (!wf) return null;
                  const a = wf.nodes.find((n) => n.id === e.from);
                  const b = wf.nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  const ax = (typeof a.x === "number" ? a.x : 80) + 90;
                  const ay = (typeof a.y === "number" ? a.y : 80) + 24;
                  const bx = (typeof b.x === "number" ? b.x : 80) + 90;
                  const by = (typeof b.y === "number" ? b.y : 80) + 24;
                  return (
                    <line
                      key={e.id}
                      x1={ax}
                      y1={ay}
                      x2={bx}
                      y2={by}
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth={3}
                    />
                  );
                })}
              </svg>

              {(parsed.wf?.nodes ?? []).map((n, idx) => {
                const x = typeof n.x === "number" ? n.x : 80 + idx * 220;
                const y = typeof n.y === "number" ? n.y : 80;
                const selected = selectedNodeId === n.id;
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    data-wf-node="1"
                    draggable={activeTool.kind === "select" || activeTool.kind === "connect"}
                    onDragStart={(e) => {
                      // allow agent pills to be dropped; do not start a browser drag ghost for nodes.
                      if (activeTool.kind !== "select") return;
                      e.dataTransfer.setData("text/plain", "");
                    }}
                    onDragOver={(e) => {
                      // Allow dropping agents.
                      if (e.dataTransfer.types.includes("text/plain")) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      const wf = parsed.wf;
                      if (!wf) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const agentId = String(e.dataTransfer.getData("text/plain") || "").trim();
                      if (!agentId) return;

                      const nextNodes = wf.nodes.map((node) => {
                        if (node.id !== n.id) return node;
                        const cfg = node.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
                        return { ...node, config: { ...cfg, agentId } };
                      });
                      setWorkflow({ ...wf, nodes: nextNodes });
                      setSelectedNodeId(n.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const wf = parsed.wf;
                      if (activeTool.kind === "connect") {
                        if (!wf) return;
                        if (!connectFromNodeId) {
                          setConnectFromNodeId(n.id);
                          setSelectedNodeId(n.id);
                          return;
                        }
                        const from = connectFromNodeId;
                        const to = n.id;
                        setConnectFromNodeId("");
                        if (!from || !to || from === to) return;
                        const exists = (wf.edges ?? []).some((e) => e.from === from && e.to === to);
                        if (exists) return;
                        const id = `e${Date.now()}`;
                        const nextEdge: WorkflowFileV1["edges"][number] = { id, from, to };
                        setWorkflow({ ...wf, edges: [...(wf.edges ?? []), nextEdge] });
                        // After creating an edge, return to Select tool.
                        setActiveTool({ kind: "select" });
                        return;
                      }

                      setSelectedNodeId(n.id);
                    }}
                    onPointerDown={(e) => {
                      // Allow dragging nodes even in connect mode (connect is click-to-connect, not drag-to-connect).
                      if (activeTool.kind === "add-node") return;
                      if (e.button !== 0) return;
                      const el = canvasRef.current;
                      if (!el) return;
                      const rect = el.getBoundingClientRect();
                      setSelectedNodeId(n.id);
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        // ignore
                      }
                      e.preventDefault();

                      const pointerX = (e.clientX - rect.left + el.scrollLeft) / zoom;
                      const pointerY = (e.clientY - rect.top + el.scrollTop) / zoom;
                      setDragging({ nodeId: n.id, dx: pointerX - x, dy: pointerY - y });
                    }}
                    onPointerUp={(e) => {
                      try {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      } catch {
                        // ignore
                      }
                      setDragging(null);
                    }}
                    onPointerMove={(e) => {
                      if (!dragging) return;
                      if (dragging.nodeId !== n.id) return;
                      const wf = parsed.wf;
                      if (!wf) return;
                      const el = canvasRef.current;
                      if (!el) return;
                      const rect = el.getBoundingClientRect();
                      const pointerX = (e.clientX - rect.left + el.scrollLeft) / zoom;
                      const pointerY = (e.clientY - rect.top + el.scrollTop) / zoom;
                      const nextX = pointerX - dragging.dx;
                      const nextY = pointerY - dragging.dy;
                      const nextNodes = wf.nodes.map((node) => (node.id === n.id ? { ...node, x: nextX, y: nextY } : node));
                      const next: WorkflowFileV1 = { ...wf, nodes: nextNodes };
                      setStatus({ kind: "ready", jsonText: JSON.stringify(next, null, 2) + "\n" });
                    }}
                    className={
                      selected
                        ? "absolute z-10 cursor-grab rounded-[var(--ck-radius-sm)] border border-white/25 bg-white/10 px-3 py-2 text-xs text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)]"
                        : "absolute z-10 cursor-grab rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-xs text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                    }
                    style={{ left: x, top: y, width: 180 }}
                  >
                    <div className="flex items-center gap-2">
                      {isMediaNode(n.type) && (
                        <span className="text-lg">
                          {n.type === 'media-image' ? '🎨' : '🎬'}
                        </span>
                      )}
                      <div className="font-medium text-[color:var(--ck-text-primary)]">{n.name || n.id}</div>
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">{n.type}</div>
                    {(() => {
                      const cfg = n.config && typeof n.config === "object" && !Array.isArray(n.config) ? (n.config as Record<string, unknown>) : null;
                      
                      // Show media generation prompt for media nodes
                      if (isMediaNode(n.type) && cfg) {
                        const prompt = String(cfg.prompt ?? "").trim();
                        const provider = String(cfg.provider ?? "auto");
                        return (
                          <div className="mt-1 space-y-0.5">
                            {prompt && (
                              <div className="text-[10px] text-[color:var(--ck-text-secondary)] truncate" title={prompt}>
                                &quot;{prompt.length > 40 ? prompt.substring(0, 40) + '...' : prompt}&quot;
                              </div>
                            )}
                            <div className="text-[10px] text-[color:var(--ck-text-tertiary)]">
                              Provider: {provider}
                            </div>
                          </div>
                        );
                      }
                      
                      // Show agent for other nodes
                      const agentId = cfg ? String(cfg.agentId ?? "").trim() : "";
                      if (!agentId) return null;
                      const short = agentId.replace(`${teamId}-`, "");
                      return <div className="mt-1 text-[10px] text-[color:var(--ck-text-secondary)]">Agent: {short}</div>;
                    })()}
                  </div>
                );
              })}

              {/* Inline in-canvas node inspector (requirement #6) */}
              {(() => {
                const wf = parsed.wf;
                if (!wf) return null;
                if (!selectedNodeId) return null;
                const node = wf.nodes.find((n) => n.id === selectedNodeId);
                if (!node) return null;

                const x = typeof node.x === "number" ? node.x : 80;
                const y = typeof node.y === "number" ? node.y : 80;
                const cfg = node.config && typeof node.config === "object" && !Array.isArray(node.config) ? (node.config as Record<string, unknown>) : {};
                const agentId = String(cfg.agentId ?? "").trim();
                const model = String(cfg.model ?? "").trim();

                return (
                  <div
                    className="absolute z-10 w-[320px] rounded-[var(--ck-radius-sm)] border border-white/15 bg-black/60 p-3 shadow-[var(--ck-shadow-1)] backdrop-blur"
                    style={{ left: x + 200, top: y }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-[color:var(--ck-text-primary)]">{node.name || node.id}</div>
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId("")}
                        className="text-[10px] text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-primary)]"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-2 space-y-2">
                      <label className="block">
                        <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">name</div>
                        <input
                          value={String(node.name ?? "")}
                          onChange={(e) => {
                            const nextName = e.target.value;
                            setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, name: nextName } : n)) });
                          }}
                          className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                          placeholder="Optional"
                        />
                      </label>

                      <label className="block">
                        <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">type</div>
                        <select
                          value={node.type}
                          onChange={(e) => {
                            const nextType = e.target.value as WorkflowFileV1["nodes"][number]["type"];
                            setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, type: nextType } : n)) });
                          }}
                          className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                        >
                          <option value="start">start</option>
                          <option value="end">end</option>
                          <option value="llm">llm</option>
                          <option value="tool">tool</option>
                          <option value="condition">condition</option>
                          <option value="delay">delay</option>
                          <option value="human_approval">human_approval</option>
                          <option value="media-image">media-image</option>
                          <option value="media-video">media-video</option>
                        </select>
                      </label>

                      <label className="block">
                        <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">agentId</div>
                        <input
                          value={agentId}
                          onChange={(e) => {
                            const nextAgentId = String(e.target.value || "").trim();
                            const nextCfg = { ...cfg, ...(nextAgentId ? { agentId: nextAgentId } : {}) };
                            if (!nextAgentId) delete (nextCfg as Record<string, unknown>).agentId;
                            setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                          }}
                          className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                          placeholder="(drag an agent onto the node or type)"
                        />
                      </label>

                      {node.type === "llm" ? (
                        <label className="block">
                          <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">model</div>
                          <select
                            value={model}
                            onChange={(e) => {
                              const nextModel = String(e.target.value || "").trim();
                              const nextCfg = { ...cfg, ...(nextModel ? { model: nextModel } : {}) };
                              if (!nextModel) delete (nextCfg as Record<string, unknown>).model;
                              setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                            }}
                            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                          >
                            <option value="">Default (inherit global)</option>
                            {availableModels.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          {availableModelsError ? (
                            <div className="mt-1 text-[10px] text-amber-300">Could not load model list: {availableModelsError}</div>
                          ) : null}
                        </label>
                      ) : null}

                      {node.type === "human_approval" ? (
                        <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-2">
                          <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">approval config</div>

                          <div className="mt-2 space-y-2">
                            <label className="block">
                              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">provider</div>
                              <input
                                value={String((cfg as Record<string, unknown>).provider ?? "")}
                                onChange={(e) => {
                                  const v = String(e.target.value || "").trim();
                                  const nextCfg = { ...cfg, ...(v ? { provider: v } : {}) };
                                  if (!v) delete (nextCfg as Record<string, unknown>).provider;
                                  setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                }}
                                className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                placeholder="telegram"
                              />
                            </label>

                            <label className="block">
                              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">target</div>
                              <input
                                value={String((cfg as Record<string, unknown>).target ?? "")}
                                onChange={(e) => {
                                  const v = String(e.target.value || "").trim();
                                  const nextCfg = { ...cfg, ...(v ? { target: v } : {}) };
                                  if (!v) delete (nextCfg as Record<string, unknown>).target;
                                  setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                }}
                                className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                placeholder="(e.g. Telegram chat id)"
                              />
                              <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">Overrides workflow-level default when set.</div>
                            </label>

                            <label className="block">
                              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">messageTemplate (optional)</div>
                              <TemplateTextareaWithVars
                                value={String((cfg as Record<string, unknown>).messageTemplate ?? "")}
                                workflow={wf}
                                currentNodeId={node.id}
                                onChangeValue={(nextValue) => {
                                  const nextCfg = { ...cfg, ...(nextValue.trim() ? { messageTemplate: nextValue } : {}) };
                                  if (!nextValue.trim()) delete (nextCfg as Record<string, unknown>).messageTemplate;
                                  setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                }}
                                className="mt-1 h-[70px] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 pr-12 font-mono text-[10px] text-[color:var(--ck-text-primary)]"
                                placeholder="Approval needed for {{workflowName}} (run {{runId}})"
                                spellCheck={false}
                              />
                              <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
                                Vars: {"{{workflowName}}"}, {"{{workflowId}}"}, {"{{runId}}"}, {"{{nodeId}}"}
                              </div>
                            </label>
                          </div>
                        </div>
                      ) : null}

                      {isMediaNode(node.type) ? (
                        <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-2">
                          <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">Media Generation</div>
                          <div className="mt-2">
                            <MediaGenerationConfigComponent
                              config={{
                                mediaType: 'image',
                                provider: 'auto',
                                prompt: '',
                                ...((node.config as Record<string, unknown>) || {})
                              } as MediaGenerationConfig}
                              onChange={(newConfig) => {
                                setWorkflow({ 
                                  ...wf, 
                                  nodes: wf.nodes.map((n) => 
                                    n.id === node.id ? { ...n, config: newConfig as unknown as Record<string, unknown> } : n
                                  ) 
                                });
                              }}
                              teamId={teamId}
                              workflow={wf}
                              workflowNodeIds={wf.nodes.map((n) => n.id)}
                              workflowEdges={(wf.edges ?? []).map((e) => ({ from: e.from, to: e.to }))}
                              currentNodeId={node.id}
                            />
                          </div>
                        </div>
                      ) : null}

                      {node.type === "llm" ? (
                        <div className="space-y-2">
                          {/* LLM-specific fields */}
                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">prompt</div>
                            <TemplateTextareaWithVars
                              value={String(cfg.promptTemplate ?? "")}
                              workflow={wf}
                              currentNodeId={node.id}
                              onChangeValue={(nextValue) => {
                                const nextCfg = { ...cfg, promptTemplate: nextValue };
                                setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                              }}
                              className="mt-1 min-h-[200px] w-full resize-y rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 p-2 pr-12 font-mono text-xs text-[color:var(--ck-text-primary)]"
                              placeholder="What should this node do? Use {{nodeId.output}} to reference upstream node outputs."
                              spellCheck={false}
                            />
                          </label>

                          {/* Output Fields */}
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">output fields (optional)</div>
                            <div className="text-[9px] text-[color:var(--ck-text-secondary)] mb-2">Define the structure of what this node should produce</div>
                            {(() => {
                              const outputFields = (cfg.outputFields as Array<{name: string, type: "text"|"list"|"json"}>) || [];
                              return (
                                <div className="space-y-1">
                                  {outputFields.map((field, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                      <input
                                        value={field.name}
                                        onChange={(e) => {
                                          const newOutputFields = [...outputFields];
                                          newOutputFields[index] = { ...field, name: e.target.value };
                                          const nextCfg = { ...cfg, outputFields: newOutputFields };
                                          setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                        }}
                                        className="flex-1 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                        placeholder="Field name"
                                      />
                                      <select
                                        value={field.type}
                                        onChange={(e) => {
                                          const newType = e.target.value as "text"|"list"|"json";
                                          const newOutputFields = [...outputFields];
                                          newOutputFields[index] = { ...field, type: newType };
                                          const nextCfg = { ...cfg, outputFields: newOutputFields };
                                          setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                        }}
                                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                      >
                                        <option value="text">text</option>
                                        <option value="list">list</option>
                                        <option value="json">json</option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newOutputFields = outputFields.filter((_, i) => i !== index);
                                          const nextCfg = { ...cfg };
                                          if (newOutputFields.length > 0) {
                                            nextCfg.outputFields = newOutputFields;
                                          } else {
                                            delete (nextCfg as Record<string, unknown>).outputFields;
                                          }
                                          setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                        }}
                                        className="text-xs text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-primary)]"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newOutputFields = [...outputFields, { name: "", type: "text" as const }];
                                      const nextCfg = { ...cfg, outputFields: newOutputFields };
                                      setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                    }}
                                    className="text-xs text-[color:var(--ck-text-secondary)] hover:text-[color:var(--ck-text-primary)]"
                                  >
                                    + Add field
                                  </button>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Timeout */}
                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">timeout (seconds)</div>
                            <input
                              type="number"
                              value={cfg.timeoutMs ? String(Number(cfg.timeoutMs) / 1000) : ""}
                              onChange={(e) => {
                                const seconds = e.target.value ? Number(e.target.value) : null;
                                const nextCfg = { ...cfg };
                                if (seconds && seconds > 0) {
                                  nextCfg.timeoutMs = seconds * 1000;
                                } else {
                                  delete (nextCfg as Record<string, unknown>).timeoutMs;
                                }
                                setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                              }}
                              className="mt-1 w-24 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                              placeholder="120"
                              min="1"
                            />
                          </label>
                        </div>
                      ) : null}

                      {/* Collapsible raw config section */}
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            const currentState = showRawConfig[node.id] ?? (node.type !== "llm");
                            setShowRawConfig({ ...showRawConfig, [node.id]: !currentState });
                          }}
                          className="mb-2 text-[10px] text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-primary)]"
                        >
                          {(showRawConfig[node.id] ?? (node.type !== "llm")) ? "Hide" : "Show"} raw config
                        </button>
                        {(showRawConfig[node.id] ?? (node.type !== "llm")) ? (
                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">config (json)</div>
                            <textarea
                              value={JSON.stringify(cfg, null, 2)}
                              onChange={(e) => {
                                try {
                                  const nextCfg = JSON.parse(e.target.value) as Record<string, unknown>;
                                  if (!nextCfg || typeof nextCfg !== "object" || Array.isArray(nextCfg)) return;
                                  setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                } catch {
                                  // ignore invalid JSON while typing
                                }
                              }}
                              className="mt-1 h-[140px] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 p-2 font-mono text-[10px] text-[color:var(--ck-text-primary)]"
                              spellCheck={false}
                            />
                            <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">(Edits apply when JSON is valid.)</div>
                          </label>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })()}
              </div>
            </div>
          </div>
        )}

        <div className="w-[380px] shrink-0 overflow-auto p-3 text-sm">
          <div className="space-y-3">
            {parsed.wf ? (
            (() => {
              const wf = parsed.wf;
              const tz = String(wf.timezone ?? "").trim() || "UTC";
              const triggers = wf.triggers ?? [];

              const meta = wf.meta && typeof wf.meta === "object" && !Array.isArray(wf.meta) ? (wf.meta as Record<string, unknown>) : {};
              const approvalBindingId = String(meta.approvalBindingId ?? "").trim();
              const approvalProvider = String(meta.approvalProvider ?? "telegram").trim() || "telegram";
              const approvalTarget = String(meta.approvalTarget ?? "").trim();

              // Cron schedule suggestions.
              // Note: dev-team automation defaults should avoid the 02:00-07:00 America/New_York blackout window.
              // We keep presets in "safe" hours by default.
              const presets = [
                { label: "(no preset)", expr: "" },
                { label: "Weekdays 09:00 local", expr: "0 9 * * 1-5" },
                { label: "Mon/Wed/Fri 09:00 local", expr: "0 9 * * 1,3,5" },
                { label: "Daily 08:00 local", expr: "0 8 * * *" },
                { label: "Daily 12:00 local", expr: "0 12 * * *" },
                { label: "Mon 09:30 local", expr: "30 9 * * 1" },
              ];

              return (
                <div className="space-y-3">
                  <details open className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)]">Workflow</summary>
                    <div className="px-3 pb-3">
                      <label className="block">
                        <div className="text-[11px] font-medium text-[color:var(--ck-text-tertiary)]">Timezone</div>
                        <input
                          value={tz}
                          onChange={(e) => {
                            const nextTz = String(e.target.value || "").trim() || "UTC";
                            setWorkflow({ ...wf, timezone: nextTz });
                          }}
                          className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-sm text-[color:var(--ck-text-primary)]"
                          placeholder="America/New_York"
                        />
                      </label>
                    </div>
                  </details>

                  <details open className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)]">Approval Channel</summary>
                    <div className="px-3 pb-3 space-y-2">
                      <label className="block">
                        <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">binding (recommended)</div>
                        <select
                          value={approvalBindingId}
                          onChange={(e) => {
                            const nextId = String(e.target.value || "").trim();
                            const selected = approvalBindings.find((b) => b.id === nextId);

                            // Store a stable-ish reference id in the workflow so it's portable.
                            // We also keep provider/target in sync for backward compatibility.
                            if (selected) {
                              setWorkflow({
                                ...wf,
                                meta: {
                                  ...meta,
                                  approvalBindingId: selected.id,
                                  approvalProvider: selected.channel,
                                  approvalTarget: selected.target,
                                },
                                nodes: wf.nodes.map((n) =>
                                  n.type === "human_approval"
                                    ? {
                                        ...n,
                                        config: {
                                          ...((n.config && typeof n.config === "object" && !Array.isArray(n.config)
                                            ? n.config
                                            : {}) as Record<string, unknown>),
                                          approvalBindingId: selected.id,
                                          provider: selected.channel,
                                          target: selected.target,
                                        },
                                      }
                                    : n
                                ),
                              });
                            } else {
                              setWorkflow({
                                ...wf,
                                meta: { ...meta, approvalBindingId: "" },
                                nodes: wf.nodes.map((n) =>
                                  n.type === "human_approval"
                                    ? {
                                        ...n,
                                        config: {
                                          ...((n.config && typeof n.config === "object" && !Array.isArray(n.config)
                                            ? n.config
                                            : {}) as Record<string, unknown>),
                                          approvalBindingId: "",
                                        },
                                      }
                                    : n
                                ),
                              });
                            }
                          }}
                          className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                        >
                          <option value="">(manual)</option>
                          {approvalBindings.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                        {approvalBindingsNeedsKitchenUpdate ? (
                          <div className="mt-1 text-[10px] text-yellow-200">
                            Kitchen looks out of date. Run <code className="font-mono">openclaw plugins update</code> then
                            <code className="ml-1 font-mono">openclaw gateway restart</code>.
                          </div>
                        ) : null}
                        {approvalBindingsError ? (
                          <div className="mt-1 text-[10px] text-red-200">Failed to load bindings: {approvalBindingsError}</div>
                        ) : null}
                        <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
                          Uses your existing OpenClaw bindings (recommended). Manual provider/target is an advanced override.
                        </div>
                      </label>

                      <details className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/10">
                        <summary className="cursor-pointer list-none px-2 py-1 text-[11px] font-medium text-[color:var(--ck-text-secondary)]">Advanced: manual override</summary>
                        <div className="px-2 pb-2 pt-1 space-y-2">
                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">provider</div>
                            <input
                              value={approvalProvider}
                              onChange={(e) => {
                                const nextProvider = String(e.target.value || "").trim() || "telegram";
                                setWorkflow({
                                  ...wf,
                                  meta: { ...meta, approvalBindingId: "", approvalProvider: nextProvider },
                                  nodes: wf.nodes.map((n) =>
                                    n.type === "human_approval"
                                      ? {
                                          ...n,
                                          config: {
                                            ...((n.config && typeof n.config === "object" && !Array.isArray(n.config)
                                              ? n.config
                                              : {}) as Record<string, unknown>),
                                            approvalBindingId: "",
                                            provider: nextProvider,
                                          },
                                        }
                                      : n
                                  ),
                                });
                              }}
                              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                              placeholder="telegram"
                            />
                          </label>

                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">target</div>
                            <input
                              value={approvalTarget}
                              onChange={(e) => {
                                const nextTarget = String(e.target.value || "").trim();
                                setWorkflow({
                                  ...wf,
                                  meta: { ...meta, approvalBindingId: "", approvalTarget: nextTarget },
                                  nodes: wf.nodes.map((n) =>
                                    n.type === "human_approval"
                                      ? {
                                          ...n,
                                          config: {
                                            ...((n.config && typeof n.config === "object" && !Array.isArray(n.config)
                                              ? n.config
                                              : {}) as Record<string, unknown>),
                                            approvalBindingId: "",
                                            target: nextTarget,
                                          },
                                        }
                                      : n
                                  ),
                                });
                              }}
                              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                              placeholder="(e.g. Telegram chat id)"
                            />
                          </label>
                        </div>
                      </details>
                    </div>
                  </details>

                  <details open className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)]">Node inspector</summary>
                    <div className="px-3 pb-3">
                      <div className="flex items-center justify-between gap-2">
                      {selectedNodeId ? (
                        <button
                          type="button"
                          onClick={() => {
                            const nodeId = selectedNodeId;
                            const nextNodes = wf.nodes.filter((n) => n.id !== nodeId);
                            const nextEdges = (wf.edges ?? []).filter((e) => e.from !== nodeId && e.to !== nodeId);
                            setWorkflow({ ...wf, nodes: nextNodes, edges: nextEdges });
                            setSelectedNodeId("");
                          }}
                          className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-red-100 hover:bg-white/10"
                        >
                          Delete node
                        </button>
                      ) : null}
                    </div>

                    {selectedNodeId ? (
                      (() => {
                        const node = wf.nodes.find((n) => n.id === selectedNodeId);
                        if (!node) return <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">No node selected.</div>;

                        return (
                          <div className="mt-3 space-y-3">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">id</div>
                              <div className="mt-1 rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]">
                                {node.id}
                              </div>
                            </div>

                            <label className="block">
                              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">name</div>
                              <input
                                value={String(node.name ?? "")}
                                onChange={(e) => {
                                  const nextName = e.target.value;
                                  setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, name: nextName } : n)) });
                                }}
                                className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                placeholder="Optional"
                              />
                            </label>

                            <label className="block">
                              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">type</div>
                              <select
                                value={node.type}
                                onChange={(e) => {
                                  const nextType = e.target.value as WorkflowFileV1["nodes"][number]["type"];
                                  setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, type: nextType } : n)) });
                                }}
                                className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                              >
                                <option value="start">start</option>
                                <option value="end">end</option>
                                <option value="llm">llm</option>
                                <option value="tool">tool</option>
                                <option value="condition">condition</option>
                                <option value="delay">delay</option>
                                <option value="human_approval">human_approval</option>
                                <option value="media-image">media-image</option>
                                <option value="media-video">media-video</option>
                              </select>
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                              <label className="block">
                                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">x</div>
                                <input
                                  type="number"
                                  value={typeof node.x === "number" ? node.x : 0}
                                  onChange={(e) => {
                                    const nextX = Number(e.target.value);
                                    setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, x: nextX } : n)) });
                                  }}
                                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                />
                              </label>
                              <label className="block">
                                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">y</div>
                                <input
                                  type="number"
                                  value={typeof node.y === "number" ? node.y : 0}
                                  onChange={(e) => {
                                    const nextY = Number(e.target.value);
                                    setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, y: nextY } : n)) });
                                  }}
                                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                />
                              </label>
                            </div>

                            {/* LLM Configuration */}
                            {node.type === "llm" ? (
                              <div className="space-y-3">
                                <label className="block">
                                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">prompt</div>
                                  <TemplateTextareaWithVars
                                    value={String(((node.config as Record<string, unknown>) || {}).promptTemplate ?? "")}
                                    workflow={wf}
                                    currentNodeId={node.id}
                                    onChangeValue={(nextValue) => {
                                      const nextCfg = { ...(node.config as Record<string, unknown>), promptTemplate: nextValue };
                                      setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                    }}
                                    className="mt-1 min-h-[150px] w-full resize-y rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 pr-12 font-mono text-xs text-[color:var(--ck-text-primary)]"
                                    placeholder="What should this node do? Use {{nodeId.output}} to reference upstream node outputs."
                                    spellCheck={false}
                                  />
                                </label>

                                <label className="block">
                                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">model</div>
                                  <select
                                    value={String(((node.config as Record<string, unknown>) || {}).model ?? "")}
                                    onChange={(e) => {
                                      const nextModel = String(e.target.value || "").trim();
                                      const nextCfg = { ...(node.config as Record<string, unknown>), ...(nextModel ? { model: nextModel } : {}) };
                                      if (!nextModel) delete nextCfg.model;
                                      setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                    }}
                                    className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                  >
                                    <option value="">Default (inherit global)</option>
                                    {availableModels.map((m) => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                  </select>
                                  {availableModelsError ? (
                                    <div className="mt-1 text-[10px] text-amber-300">Could not load model list: {availableModelsError}</div>
                                  ) : null}
                                </label>

                                <label className="block">
                                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">timeout (seconds)</div>
                                  <input
                                    type="number"
                                    value={((node.config as Record<string, unknown>) || {}).timeoutMs ? String(Number(((node.config as Record<string, unknown>) || {}).timeoutMs) / 1000) : ""}
                                    onChange={(e) => {
                                      const seconds = e.target.value ? Number(e.target.value) : null;
                                      const nextCfg = { ...(node.config as Record<string, unknown>) };
                                      if (seconds && seconds > 0) {
                                        nextCfg.timeoutMs = seconds * 1000;
                                      } else {
                                        delete nextCfg.timeoutMs;
                                      }
                                      setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                    }}
                                    className="mt-1 w-24 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                    placeholder="120"
                                    min="1"
                                  />
                                </label>
                              </div>
                            ) : null}

                            {/* Media Generation Configuration */}
                            {isMediaNode(node.type) ? (
                              <div>
                                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">Media Generation</div>
                                <div className="mt-1">
                                  <MediaGenerationConfigComponent
                                    config={{
                                      mediaType: 'image',
                                      provider: 'auto',
                                      prompt: '',
                                      ...((node.config as Record<string, unknown>) || {})
                                    } as MediaGenerationConfig}
                                    onChange={(newConfig) => {
                                      setWorkflow({ 
                                        ...wf, 
                                        nodes: wf.nodes.map((n) => 
                                          n.id === node.id ? { ...n, config: newConfig as unknown as Record<string, unknown> } : n
                                        ) 
                                      });
                                    }}
                                    teamId={teamId}
                                    workflow={wf}
                                    workflowNodeIds={wf.nodes.map((n) => n.id)}
                                    workflowEdges={(wf.edges ?? []).map((e) => ({ from: e.from, to: e.to }))}
                                    currentNodeId={node.id}
                                  />
                                </div>
                              </div>
                            ) : null}

                            {/* Human Approval Configuration */}
                            {node.type === "human_approval" ? (
                              <div className="space-y-2">
                                <label className="block">
                                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">provider</div>
                                  <input
                                    value={String(((node.config as Record<string, unknown>) || {}).provider ?? "")}
                                    onChange={(e) => {
                                      const v = String(e.target.value || "").trim();
                                      const nextCfg = { ...(node.config as Record<string, unknown>), ...(v ? { provider: v } : {}) };
                                      if (!v) delete nextCfg.provider;
                                      setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                    }}
                                    className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                    placeholder="telegram"
                                  />
                                </label>

                                <label className="block">
                                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">target</div>
                                  <input
                                    value={String(((node.config as Record<string, unknown>) || {}).target ?? "")}
                                    onChange={(e) => {
                                      const v = String(e.target.value || "").trim();
                                      const nextCfg = { ...(node.config as Record<string, unknown>), ...(v ? { target: v } : {}) };
                                      if (!v) delete nextCfg.target;
                                      setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                    }}
                                    className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                    placeholder="(e.g. Telegram chat id)"
                                  />
                                  <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">Overrides workflow-level default when set.</div>
                                </label>

                                <label className="block">
                                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">messageTemplate (optional)</div>
                                  <TemplateTextareaWithVars
                                    value={String(((node.config as Record<string, unknown>) || {}).messageTemplate ?? "")}
                                    workflow={wf}
                                    currentNodeId={node.id}
                                    onChangeValue={(nextValue) => {
                                      const nextCfg = { ...(node.config as Record<string, unknown>), ...(nextValue.trim() ? { messageTemplate: nextValue } : {}) };
                                      if (!nextValue.trim()) delete nextCfg.messageTemplate;
                                      setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                    }}
                                    className="mt-1 h-[70px] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 pr-12 font-mono text-[10px] text-[color:var(--ck-text-primary)]"
                                    placeholder="Approval needed for {{workflowName}} (run {{runId}})"
                                    spellCheck={false}
                                  />
                                  <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
                                    Vars: {"{{workflowName}}"}, {"{{workflowId}}"}, {"{{runId}}"}, {"{{nodeId}}"}
                                  </div>
                                </label>
                              </div>
                            ) : null}

                            {/* Output Fields for ALL node types */}
                            <div>
                              <OutputFieldsEditor
                                outputFields={(((node.config as Record<string, unknown>) || {}).outputFields as OutputField[]) || []}
                                onChange={(newOutputFields) => {
                                  const nextCfg = { ...(node.config as Record<string, unknown>) };
                                  if (newOutputFields.length > 0) {
                                    nextCfg.outputFields = newOutputFields;
                                  } else {
                                    delete nextCfg.outputFields;
                                  }
                                  setWorkflow({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, config: nextCfg } : n)) });
                                }}
                              />
                            </div>

                            {/* Raw config section for debugging */}
                            <details className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/10">
                              <summary className="cursor-pointer list-none px-2 py-1 text-[10px] font-medium text-[color:var(--ck-text-secondary)]">Raw Config (debug)</summary>
                              <div className="p-2">
                                <pre className="mt-1 max-h-[150px] overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 text-[9px] text-[color:var(--ck-text-tertiary)]">
                                  {JSON.stringify(node.config ?? {}, null, 2)}
                                </pre>
                              </div>
                            </details>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">Select a node.</div>
                    )}
                  </div>
                  </details>

                  <details open className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)]">Triggers</summary>
                    <div className="px-3 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">triggers</div>
                      <button
                        type="button"
                        onClick={() => {
                          const id = `t${Date.now()}`;
                          setWorkflow({
                            ...wf,
                            triggers: [
                              ...triggers,
                              { kind: "cron", id, name: "New trigger", enabled: true, expr: "0 9 * * 1-5", tz },
                            ],
                          });
                        }}
                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                      >
                        + Add
                      </button>
                    </div>

                    {/* Trigger sync status */}
                    {triggerSyncStatus !== "idle" && (
                      <div className="mt-2 flex items-center gap-2 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1">
                        {triggerSyncStatus === "syncing" && (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border border-blue-400 border-t-transparent"></div>
                            <div className="text-xs text-blue-400">Syncing triggers...</div>
                          </>
                        )}
                        {triggerSyncStatus === "success" && (
                          <>
                            <div className="text-green-400">✓</div>
                            <div className="text-xs text-green-400">Triggers synced</div>
                          </>
                        )}
                        {triggerSyncStatus === "error" && (
                          <>
                            <div className="text-red-400">✗</div>
                            <div className="text-xs text-red-400">Trigger sync failed: {triggerSyncError}</div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="mt-2 space-y-2">
                      {triggers.length ? (
                        triggers.map((t, i) => {
                          const kind = (t as { kind?: unknown }).kind;
                          const isCron = kind === "cron";
                          const id = String((t as { id?: unknown }).id ?? "");
                          const name = String((t as { name?: unknown }).name ?? "");
                          const enabled = Boolean((t as { enabled?: unknown }).enabled);
                          const expr = String((t as { expr?: unknown }).expr ?? "");
                          const trigTz = String((t as { tz?: unknown }).tz ?? tz);
                          const cronFields = expr.trim().split(/\s+/).filter(Boolean);
                          const cronLooksValid = !expr.trim() || cronFields.length === 5;

                          return (
                            <div key={`${id}-${i}`} className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-[color:var(--ck-text-primary)]">{name || id || `trigger-${i + 1}`}</div>
                                <button
                                  type="button"
                                  onClick={() => setWorkflow({ ...wf, triggers: triggers.filter((_, idx) => idx !== i) })}
                                  className="text-[10px] text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-primary)]"
                                >
                                  Remove
                                </button>
                              </div>

                              {!isCron ? (
                                <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">Unsupported trigger kind: {String(kind)}</div>
                              ) : null}

                              <div className="mt-2 grid grid-cols-1 gap-2">
                                <label className="flex items-center gap-2 text-xs text-[color:var(--ck-text-secondary)]">
                                  <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => {
                                      const nextEnabled = e.target.checked;
                                      setWorkflow({
                                        ...wf,
                                        triggers: triggers.map((x, idx) => (idx === i && x.kind === "cron" ? { ...x, enabled: nextEnabled } : x)),
                                      });
                                    }}
                                  />
                                  Enabled
                                </label>

                                <label className="block">
                                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">name</div>
                                  <input
                                    value={name}
                                    onChange={(e) => {
                                      const nextName = e.target.value;
                                      setWorkflow({
                                        ...wf,
                                        triggers: triggers.map((x, idx) => (idx === i && x.kind === "cron" ? { ...x, name: nextName } : x)),
                                      });
                                    }}
                                    className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                    placeholder="Content cadence"
                                  />
                                </label>

                                <label className="block">
                                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">schedule (cron)</div>
                                  <input
                                    value={expr}
                                    onChange={(e) => {
                                      const nextExpr = e.target.value;
                                      setWorkflow({
                                        ...wf,
                                        triggers: triggers.map((x, idx) => (idx === i && x.kind === "cron" ? { ...x, expr: nextExpr } : x)),
                                      });
                                    }}
                                    className={
                                      cronLooksValid
                                        ? "mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 font-mono text-[11px] text-[color:var(--ck-text-primary)]"
                                        : "mt-1 w-full rounded-[var(--ck-radius-sm)] border border-red-400/50 bg-black/25 px-2 py-1 font-mono text-[11px] text-[color:var(--ck-text-primary)]"
                                    }
                                    placeholder="0 9 * * 1,3,5"
                                  />
                                  {!cronLooksValid ? (
                                    <div className="mt-1 text-[10px] text-red-200">
                                      Cron should be 5 fields (min hour dom month dow). You entered {cronFields.length}.
                                    </div>
                                  ) : null}
                                  <div className="mt-1 grid grid-cols-1 gap-1">
                                    <select
                                      value={presets.some((p) => p.expr === expr) ? expr : ""}
                                      onChange={(e) => {
                                        const nextExpr = e.target.value;
                                        setWorkflow({
                                          ...wf,
                                          triggers: triggers.map((x, idx) => (idx === i && x.kind === "cron" ? { ...x, expr: nextExpr } : x)),
                                        });
                                      }}
                                      className="w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-[11px] text-[color:var(--ck-text-secondary)]"
                                    >
                                      {presets.map((p) => (
                                        <option key={p.label} value={p.expr}>
                                          {p.label}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="text-[10px] text-[color:var(--ck-text-tertiary)]">Presets set the cron; edit freely for advanced schedules.</div>
                                  </div>
                                </label>

                                <label className="block">
                                  <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">timezone override</div>
                                  <input
                                    value={trigTz}
                                    onChange={(e) => {
                                      const nextTz = String(e.target.value || "").trim() || tz;
                                      setWorkflow({
                                        ...wf,
                                        triggers: triggers.map((x, idx) => (idx === i && x.kind === "cron" ? { ...x, tz: nextTz } : x)),
                                      });
                                    }}
                                    className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                                    placeholder={tz}
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-[color:var(--ck-text-secondary)]">No triggers yet.</div>
                      )}
                    </div>
                    </div>
                  </details>

                  <details open className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)]">Runs</summary>
                    <div className="px-3 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Runs (history)</div>
                        <Link
                          href={`/teams/${encodeURIComponent(teamId)}/runs`}
                          className="text-[10px] font-medium text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-secondary)] hover:underline"
                        >
                          View all →
                        </Link>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            const wfId = String(wf.id ?? "").trim();
                            if (!wfId) return;
                            setWorkflowRunsError("");
                            setWorkflowRunsLoading(true);
                            try {
                              const res = await fetch("/api/teams/workflow-runs", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                // Enqueue a canonical file-first run via the CLI (Kitchen should not author run artifacts).
                                body: JSON.stringify({ teamId, workflowId: wfId, mode: "enqueue" }),
                              });
                              const json = await res.json();
                              if (!res.ok || !json.ok) throw new Error(json.error || "Failed to enqueue run");

                              const listRes = await fetch(
                                `/api/teams/workflow-runs?teamId=${encodeURIComponent(teamId)}&workflowId=${encodeURIComponent(wfId)}`,
                                { cache: "no-store" }
                              );
                              const listJson = await listRes.json();
                              if (!listRes.ok || !listJson.ok) throw new Error(listJson.error || "Failed to refresh runs");
                              const files = Array.isArray(listJson.files) ? listJson.files : [];
                              const list = files.map((f: unknown) => String(f ?? "").trim()).filter((f: string) => Boolean(f));
                              setWorkflowRuns(list);
                            } catch (e: unknown) {
                              setWorkflowRunsError(e instanceof Error ? e.message : String(e));
                            } finally {
                              setWorkflowRunsLoading(false);
                            }
                          }}
                          className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
                        >
                          + Queue run
                        </button>
                        <button
                          type="button"
                          disabled={saving || cronLoading || !runPreflight.ok}
                          onClick={async () => {
                            const wfId = String(wf.id ?? "").trim();
                            if (!wfId) return;

                            // Preflight: all nodes must be assigned.
                            if (runPreflight.missingAgentOnNodeIds.length) {
                              setWorkflowRunsError("All nodes must be assigned to an agent.");
                              return;
                            }

                            // Cron reconciliation: keep the system clean by disabling orphaned worker crons,
                            // and install/enable missing worker crons before enqueue.
                            if (runPreflight.agentIdsMissingCron.length) {
                              setInstallCronBusy(true);
                              setInstallCronError("");
                              try {
                                const reconcileRes = await fetch("/api/cron/worker", {
                                  method: "POST",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({ action: "reconcile", teamId }),
                                });
                                const reconcileJson = (await reconcileRes.json()) as { ok?: boolean; error?: string };
                                if (!reconcileRes.ok || reconcileJson.ok === false) {
                                  throw new Error(reconcileJson.error || "Failed to reconcile worker crons");
                                }
                                const map = await refreshCronMap();
                                const stillMissing = runPreflight.requiredAgentIds.filter((id) => !map[id]);
                                if (stillMissing.length) {
                                  setWorkflowRunsError(`Cron not set up for: ${stillMissing.join(", ")}`);
                                  return;
                                }
                              } catch (e: unknown) {
                                setWorkflowRunsError(e instanceof Error ? e.message : String(e));
                                return;
                              } finally {
                                setInstallCronBusy(false);
                              }
                            }

                            setWorkflowRunsError("");
                            setWorkflowRunsLoading(true);
                            try {
                              const res = await fetch("/api/teams/workflow-runs", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ teamId, workflowId: wfId, mode: "run_now" }),
                              });
                              const json = await res.json();
                              if (!res.ok || !json.ok) throw new Error(json.error || "Failed to create run");

                              // Redirect to run page if runId is available
                              const newRunId = String(json.runId ?? "").trim();
                              if (newRunId) {
                                router.push(`/teams/${teamId}/runs/${workflowId}/${newRunId}`);
                                return;
                              }

                              const listRes = await fetch(
                                `/api/teams/workflow-runs?teamId=${encodeURIComponent(teamId)}&workflowId=${encodeURIComponent(wfId)}`,
                                { cache: "no-store" }
                              );
                              const listJson = await listRes.json();
                              if (!listRes.ok || !listJson.ok) throw new Error(listJson.error || "Failed to refresh runs");
                              const files = Array.isArray(listJson.files) ? listJson.files : [];
                              const list = files.map((f: unknown) => String(f ?? "").trim()).filter((f: string) => Boolean(f));
                              setWorkflowRuns(list);
                            } catch (e: unknown) {
                              setWorkflowRunsError(e instanceof Error ? e.message : String(e));
                            } finally {
                              setWorkflowRunsLoading(false);
                            }
                          }}
                          className="rounded-[var(--ck-radius-sm)] border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-50 hover:bg-emerald-500/15 disabled:opacity-50"
                          title="Enqueue a run for the workflow runner (Kitchen does not execute nodes)"
                        >
                          + Run now
                        </button>
                        {cronError ? (
                          <div className="ml-2 text-[10px] text-amber-100/90" title={cronError}>
                            Cron check unavailable
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {runPreflight.missingAgentOnNodeIds.length ? (
                      <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100">
                        All nodes must be assigned to an agent. Missing agentId on: {runPreflight.missingAgentOnNodeIds.join(", ")}
                      </div>
                    ) : runPreflight.agentIdsMissingCron.length ? (
                      <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-50">
                        <div>Cron not set up for: {runPreflight.agentIdsMissingCron.join(", ")}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setInstallCronError("");
                              setInstallCronOpen(true);
                            }}
                            className="rounded-[var(--ck-radius-sm)] border border-amber-300/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-50 hover:bg-amber-500/15"
                          >
                            Install worker cron(s)
                          </button>
                          <button
                            type="button"
                            onClick={() => void refreshCronMap()}
                            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                          >
                            Re-check
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <ConfirmationModal
                      open={installCronOpen}
                      title="Install worker cron jobs?"
                      busy={installCronBusy}
                      error={installCronError || undefined}
                      confirmLabel="Install"
                      onClose={() => {
                        if (installCronBusy) return;
                        setInstallCronOpen(false);
                      }}
                      onConfirm={async () => {
                        setInstallCronBusy(true);
                        setInstallCronError("");
                        try {
                          const res = await fetch("/api/cron/worker", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ action: "reconcile", teamId }),
                          });
                          const json = (await res.json()) as { ok?: boolean; error?: string };
                          if (!res.ok || json.ok === false) throw new Error(json.error || "Failed to install worker crons");

                          await refreshCronMap();
                          setInstallCronOpen(false);
                        } catch (e: unknown) {
                          setInstallCronError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setInstallCronBusy(false);
                        }
                      }}
                    >
                      <div className="text-sm text-[color:var(--ck-text-secondary)]">
                        Kitchen will install (or enable) worker cron jobs for the following agents so this workflow can drain:
                        <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 font-mono text-[11px] text-[color:var(--ck-text-primary)]">
                          {runPreflight.agentIdsMissingCron.join(", ")}
                        </div>
                        <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                          Cron cadence: every 5 minutes. The worker runs: <span className="font-mono">openclaw recipes workflows worker-tick</span>.
                        </div>
                      </div>
                    </ConfirmationModal>

                    {workflowRunsError ? (
                      <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100">
                        {workflowRunsError}
                      </div>
                    ) : null}

                    <div className="mt-2 space-y-1">
                      {workflowRunsLoading ? (
                        <div className="text-xs text-[color:var(--ck-text-secondary)]">Serving up hot…</div>
                      ) : workflowRuns.length ? (
                        workflowRuns.slice(0, 8).map((f) => {
                          const wfId = String(wf.id ?? "").trim();
                          const runId = String(f).replace(/\.run\.json$/i, "");
                          const selected = selectedWorkflowRunId === runId;
                          const href = wfId
                            ? `/teams/${encodeURIComponent(teamId)}/runs/${encodeURIComponent(wfId)}/${encodeURIComponent(runId)}`
                            : "#";

                          return (
                            <Link
                              key={f}
                              href={href}
                              onClick={() => setSelectedWorkflowRunId(runId)}
                              className={
                                selected
                                  ? "block w-full rounded-[var(--ck-radius-sm)] bg-white/10 px-2 py-1 text-left text-[11px] font-mono text-[color:var(--ck-text-primary)]"
                                  : "block w-full rounded-[var(--ck-radius-sm)] px-2 py-1 text-left text-[11px] font-mono text-[color:var(--ck-text-secondary)] hover:bg-white/5"
                              }
                              title="Open run detail"
                            >
                              {runId}
                            </Link>
                          );
                        })
                      ) : (
                        <div className="text-xs text-[color:var(--ck-text-secondary)]">No runs yet.</div>
                      )}
                    </div>

                    <details open className="mt-3 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/10">
                      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)]">Nodes</summary>
                      <div className="px-3 pb-3">

                      <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2">
                        <div className="grid grid-cols-1 gap-2">
                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">id</div>
                            <input
                              value={newNodeId}
                              onChange={(e) => setNewNodeId(e.target.value)}
                              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                              placeholder="e.g. draft_assets"
                            />
                          </label>

                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">name (optional)</div>
                            <input
                              value={newNodeName}
                              onChange={(e) => setNewNodeName(e.target.value)}
                              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                              placeholder="Human-friendly label"
                            />
                          </label>

                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">type</div>
                            <select
                              value={newNodeType}
                              onChange={(e) => setNewNodeType(e.target.value as WorkflowFileV1["nodes"][number]["type"])}
                              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                            >
                              <option value="start">start</option>
                              <option value="end">end</option>
                              <option value="llm">llm</option>
                              <option value="tool">tool</option>
                              <option value="condition">condition</option>
                              <option value="delay">delay</option>
                              <option value="human_approval">human_approval</option>
                              <option value="media-image">media-image</option>
                              <option value="media-video">media-video</option>
                            </select>
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              const rawId = String(newNodeId || "").trim();
                              const id = rawId.replace(/[^a-z0-9_\-]/gi, "_");
                              if (!id) return;
                              if (wf.nodes.some((n) => n.id === id)) return;

                              const maxX = wf.nodes.reduce((acc, n) => (typeof n.x === "number" ? Math.max(acc, n.x) : acc), 80);
                              const nextNode = {
                                id,
                                type: newNodeType,
                                name: String(newNodeName || "").trim() || id,
                                x: maxX + 220,
                                y: 80,
                              } as WorkflowFileV1["nodes"][number];

                              setWorkflow({ ...wf, nodes: [...wf.nodes, nextNode] });
                              setSelectedNodeId(id);
                              setNewNodeId("");
                              setNewNodeName("");
                            }}
                            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                          >
                            + Add node
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1">
                        {wf.nodes.map((n) => {
                          const selected = selectedNodeId === n.id;
                          return (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => setSelectedNodeId(n.id)}
                              className={
                                selected
                                  ? "w-full rounded-[var(--ck-radius-sm)] bg-white/10 px-2 py-1 text-left text-[11px] text-[color:var(--ck-text-primary)]"
                                  : "w-full rounded-[var(--ck-radius-sm)] px-2 py-1 text-left text-[11px] text-[color:var(--ck-text-secondary)] hover:bg-white/5"
                              }
                            >
                              <span className="font-mono">{n.id}</span>
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">{n.type}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    </details>

                    <details open className="mt-3 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/10">
                      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)]">Edges</summary>
                      <div className="px-3 pb-3">

                      <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2">
                        <div className="grid grid-cols-1 gap-2">
                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">from</div>
                            <select
                              value={newEdgeFrom}
                              onChange={(e) => setNewEdgeFrom(e.target.value)}
                              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                            >
                              <option value="">(select)</option>
                              {wf.nodes.map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.id}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">to</div>
                            <select
                              value={newEdgeTo}
                              onChange={(e) => setNewEdgeTo(e.target.value)}
                              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                            >
                              <option value="">(select)</option>
                              {wf.nodes.map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.id}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">label (optional)</div>
                            <input
                              value={newEdgeLabel}
                              onChange={(e) => setNewEdgeLabel(e.target.value)}
                              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
                              placeholder="e.g. approve"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              const from = String(newEdgeFrom || "").trim();
                              const to = String(newEdgeTo || "").trim();
                              if (!from || !to) return;
                              if (from === to) return;
                              const id = `e${Date.now()}`;
                              const nextEdge: WorkflowFileV1["edges"][number] = {
                                id,
                                from,
                                to,
                                ...(String(newEdgeLabel || "").trim() ? { label: String(newEdgeLabel).trim() } : {}),
                              };
                              setWorkflow({ ...wf, edges: [...(wf.edges ?? []), nextEdge] });
                              setNewEdgeLabel("");
                            }}
                            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                          >
                            + Add edge
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 space-y-2">
                        {(wf.edges ?? []).length ? (
                          (wf.edges ?? []).map((e) => (
                            <div key={e.id} className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] text-[color:var(--ck-text-secondary)]">
                                  <span className="font-mono">{e.from}</span> → <span className="font-mono">{e.to}</span>
                                  {e.label ? <span className="ml-2 text-[10px] text-[color:var(--ck-text-tertiary)]">({e.label})</span> : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setWorkflow({ ...wf, edges: (wf.edges ?? []).filter((x) => x.id !== e.id) })}
                                  className="text-[10px] text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-primary)]"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-[color:var(--ck-text-secondary)]">No edges yet.</div>
                        )}
                      </div>
                    </div>
                    </details>


                  </div>
                  </details>
                </div>
              );
            })()
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
