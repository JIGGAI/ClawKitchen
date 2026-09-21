import type { KitchenManifest } from "@/lib/manifest";
import type { GraphNodeStatus, RunGraph } from "@/lib/workflows/run-graph";

/**
 * What agents are doing, what each did last, and what needs a person —
 * derived from workflow queues, runs and the manifest. Pure; the file reads
 * live in `overview.ts`.
 */

export type QueueTask = { id: string; ts: string | null; runId: string | null; nodeId: string | null };

export type QueueClaim = {
  taskId: string;
  claimedAt: string | null;
  leaseSeconds: number | null;
  /** The queued task this claim is for, if it is still in the queue file. */
  task: QueueTask | null;
};

export type AgentQueue = {
  teamId: string;
  agentId: string;
  /** Tasks at or past the worker's read cursor. */
  pending: QueueTask[];
  claims: QueueClaim[];
};

export type WorkItem = {
  agentId: string;
  teamId: string;
  source: "claim" | "run";
  runId: string | null;
  workflowId: string | null;
  workflowName: string | null;
  nodeId: string | null;
  since: string | null;
};

export type LastSeen = {
  agentId: string;
  teamId: string;
  runId: string;
  workflowId: string;
  workflowName: string | null;
  nodeId: string;
  status: GraphNodeStatus;
  ts: string;
};

export type Attention = { id: string; level: "fail" | "warn"; title: string; detail: string; href: string | null };

export type TeamSummary = {
  id: string;
  name: string;
  agents: { id: string; name: string }[];
  lead: string | null;
  missingRoles: string[];
  tickets: { backlog: number; inProgress: number; testing: number; done: number; total: number };
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** ClawRecipes writes claims without a lease; a worker turn takes minutes, so an hour is stuck. */
export const DEFAULT_CLAIM_LEASE_SECONDS = 3600;

const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "waiting_workers"]);
const FINISHED_NODE_STATUSES = new Set<GraphNodeStatus>(["success", "error", "waiting"]);

function ms(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

/** True when `iso` is more than `span` ago — or unknown, which is no better. */
function olderThan(iso: string | null | undefined, span: number, now: number): boolean {
  const age = now - ms(iso);
  return Number.isNaN(age) || age > span;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function ago(iso: string | null | undefined, now: number): string {
  const t = ms(iso);
  if (!Number.isFinite(t)) return "unknown";
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function isClaimLive(claim: QueueClaim, now: number): boolean {
  const claimedAt = ms(claim.claimedAt);
  if (!Number.isFinite(claimedAt)) return false;
  const lease = claim.leaseSeconds ?? DEFAULT_CLAIM_LEASE_SECONDS;
  return now - claimedAt <= lease * 1000;
}

function claimedWork(queues: AgentQueue[], runs: RunGraph[], now: number): WorkItem[] {
  const runsById = new Map(runs.map((r) => [`${r.teamId}/${r.runId}`, r]));
  return queues.flatMap((q) =>
    q.claims
      .filter((claim) => isClaimLive(claim, now))
      .map((claim): WorkItem => {
        const runId = claim.task?.runId ?? null;
        const owner = runId ? runsById.get(`${q.teamId}/${runId}`) : undefined;
        return {
          agentId: q.agentId,
          teamId: q.teamId,
          source: "claim",
          runId,
          workflowId: owner?.workflowId ?? null,
          workflowName: owner?.workflowName ?? null,
          nodeId: claim.task?.nodeId ?? null,
          since: claim.claimedAt,
        };
      }),
  );
}

function runningNodes(runs: RunGraph[]): WorkItem[] {
  return runs
    .filter((r) => ACTIVE_RUN_STATUSES.has(r.status))
    .flatMap((r) =>
      r.nodes
        .filter((n) => n.status === "running" && n.agent)
        .map((n): WorkItem => ({
          agentId: n.agent ?? "",
          teamId: r.teamId,
          source: "run",
          runId: r.runId,
          workflowId: r.workflowId,
          workflowName: r.workflowName,
          nodeId: n.id,
          since: n.ts ?? r.updatedAt,
        })),
    );
}

export function workingNow(queues: AgentQueue[], runs: RunGraph[], now: number): WorkItem[] {
  // A claimed step is usually also a running node; list it once, as the claim.
  const seen = new Set<string>();
  const items = [...claimedWork(queues, runs, now), ...runningNodes(runs)].filter((w) => {
    const key = `${w.agentId}|${w.runId}|${w.nodeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return items.sort((a, b) => (ms(b.since) || 0) - (ms(a.since) || 0));
}

export function lastSeenByAgent(runs: RunGraph[]): Map<string, LastSeen> {
  const latest = new Map<string, LastSeen>();
  for (const r of runs) {
    for (const n of r.nodes) {
      if (!n.agent || !n.ts || !FINISHED_NODE_STATUSES.has(n.status)) continue;
      const current = latest.get(n.agent);
      if (current && ms(current.ts) >= ms(n.ts)) continue;
      latest.set(n.agent, {
        agentId: n.agent,
        teamId: r.teamId,
        runId: r.runId,
        workflowId: r.workflowId,
        workflowName: r.workflowName,
        nodeId: n.id,
        status: n.status,
        ts: n.ts,
      });
    }
  }
  return latest;
}

function staleApprovals(runs: RunGraph[], now: number): Attention[] {
  return runs
    .filter((r) => r.status === "awaiting_approval" && olderThan(r.updatedAt ?? r.createdAt, DAY, now))
    .map((r) => ({
      id: `approval:${r.teamId}/${r.runId}`,
      level: "warn" as const,
      title: `Approval waiting since ${ago(r.updatedAt ?? r.createdAt, now)}`,
      detail: `${r.workflowName ?? r.workflowId} · ${r.teamId}`,
      href: "/workflows",
    }));
}

function failedRuns(runs: RunGraph[], now: number): Attention[] {
  const failed = runs.filter((r) => r.status === "error" && now - ms(r.updatedAt ?? r.createdAt) <= DAY);
  if (failed.length === 0) return [];
  const names = Array.from(new Set(failed.map((r) => r.workflowName ?? r.workflowId)));
  const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : "");
  return [{ id: "failed-runs", level: "fail", title: `${plural(failed.length, "run")} failed in the last 24h`, detail: shown, href: "/workflows?status=error" }];
}

function queueProblems(queues: AgentQueue[], now: number): Attention[] {
  const items: Attention[] = [];
  for (const q of queues) {
    const oldest = Math.min(...q.pending.map((t) => ms(t.ts)).filter(Number.isFinite));
    if (q.pending.length && Number.isFinite(oldest) && now - oldest > HOUR) {
      items.push({
        id: `queue:${q.teamId}/${q.agentId}`,
        level: "fail",
        title: `${plural(q.pending.length, "task")} queued for ${q.agentId}, oldest ${ago(new Date(oldest).toISOString(), now)}`,
        detail: "No worker has picked these up — check the agent's workflow-worker cron.",
        href: "/cron-jobs",
      });
    }
    for (const claim of q.claims) {
      if (isClaimLive(claim, now)) continue;
      items.push({
        id: `claim:${q.teamId}/${q.agentId}/${claim.taskId}`,
        level: "warn",
        title: `${q.agentId} has held a task since ${ago(claim.claimedAt, now)}`,
        detail: claim.task?.runId ? `run ${claim.task.runId} · ${claim.task.nodeId}` : `task ${claim.taskId}`,
        href: null,
      });
    }
  }
  return items;
}

function manifestProblem(generatedAt: string | null, now: number): Attention[] {
  if (!generatedAt) {
    return [{ id: "manifest", level: "warn", title: "Kitchen manifest is missing", detail: "Team and agent lists fall back to slower reads.", href: null }];
  }
  if (now - ms(generatedAt) <= HOUR) return [];
  return [{
    id: "manifest",
    level: "warn",
    title: `Kitchen manifest last regenerated ${ago(generatedAt, now)}`,
    detail: "`openclaw recipes kitchen-manifest` may be failing; team and agent lists may be out of date.",
    href: null,
  }];
}

export function needsAttention(input: {
  runs: RunGraph[];
  queues: AgentQueue[];
  manifestGeneratedAt: string | null;
  now: number;
}): Attention[] {
  const { runs, queues, manifestGeneratedAt, now } = input;
  const items = [
    ...failedRuns(runs, now),
    ...staleApprovals(runs, now),
    ...queueProblems(queues, now),
    ...manifestProblem(manifestGeneratedAt, now),
  ];
  // Failures first; Array#sort is stable, so each group keeps its order.
  const rank = (a: Attention) => (a.level === "fail" ? 0 : 1);
  return items.sort((a, b) => rank(a) - rank(b));
}

export function teamSummaries(manifest: KitchenManifest): TeamSummary[] {
  const recipeNames = new Map(manifest.recipes.filter((r) => r.kind === "team").map((r) => [r.id, r.name]));
  return Object.values(manifest.teams)
    // `main` is the personal workspace, not a team.
    .filter((t) => t.teamId !== "main")
    .map((t) => {
      const agents = manifest.agents
        .filter((a) => (a.workspace ?? "").includes(`/workspace-${t.teamId}/`))
        .map((a) => ({ id: a.id, name: a.identityName ?? a.id }));
      const ids = new Set(agents.map((a) => a.id));
      const counts = t.ticketCounts;
      return {
        id: t.teamId,
        name: t.displayName ?? recipeNames.get(t.teamId) ?? t.teamId,
        agents,
        lead: ids.has(`${t.teamId}-lead`) ? `${t.teamId}-lead` : null,
        missingRoles: (t.roles ?? []).filter((role) => !ids.has(`${t.teamId}-${role}`)),
        tickets: {
          backlog: counts?.backlog ?? 0,
          inProgress: counts?.["in-progress"] ?? 0,
          testing: counts?.testing ?? 0,
          done: counts?.done ?? 0,
          total: counts?.total ?? 0,
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
