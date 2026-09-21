import Link from "next/link";
import { ago, type Attention, type LastSeen, type TeamSummary, type WorkItem } from "@/lib/dashboard/activity";
import type { DashboardPlugin } from "@/lib/dashboard/overview";
import type { InstalledWorkflow } from "@/lib/workflows/overview";
import type { RunGraph } from "@/lib/workflows/run-graph";
import SelectTeamLink from "./select-team-link";

/** Dashboard panels — server components over data read at request time. */

const CARD = "ck-card p-4";
const LABEL = "text-xs uppercase tracking-wide text-[color:var(--ck-text-tertiary)]";
const MUTED = "text-xs text-[color:var(--ck-text-tertiary)]";
const LINK_MUTED = "text-xs text-[color:var(--ck-text-tertiary)] hover:underline";

const RUN_BADGE: Record<string, string> = {
  completed: "bg-emerald-500/20 text-emerald-300",
  running: "bg-sky-500/20 text-sky-300",
  queued: "bg-sky-500/20 text-sky-300",
  waiting_workers: "bg-sky-500/20 text-sky-300",
  awaiting_approval: "bg-amber-500/20 text-amber-300",
  needs_revision: "bg-amber-500/20 text-amber-300",
  error: "bg-red-500/20 text-red-300",
};

function badge(status: string): string {
  return RUN_BADGE[status] ?? "bg-white/10 text-[color:var(--ck-text-secondary)]";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function human(s: string): string {
  return s.replace(/_/g, " ");
}

function agentHref(id: string): string {
  return `/agents/${encodeURIComponent(id)}`;
}

function runHref(teamId: string, workflowId: string, runId: string): string {
  return `/teams/${encodeURIComponent(teamId)}/runs/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}`;
}

function PanelHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {aside}
    </div>
  );
}

export function StatCard({ label, value, hint, href }: { label: string; value: number; hint: string; href?: string }) {
  const body = (
    <>
      <div className={LABEL}>{label}</div>
      <div className="mt-2 text-4xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 truncate text-xs text-[color:var(--ck-text-secondary)]">{hint}</div>
    </>
  );
  return href ? (
    <Link href={href} className={`${CARD} block transition-colors hover:bg-white/5`}>
      {body}
    </Link>
  ) : (
    <div className={CARD}>{body}</div>
  );
}

function stepLabel(workflow: string | null, nodeId: string | null): string {
  return [workflow, nodeId].filter(Boolean).join(" · ") || "unknown step";
}

export function WorkingNow({
  working,
  lastSeen,
  agents,
  now,
}: {
  working: WorkItem[];
  lastSeen: Map<string, LastSeen>;
  agents: { id: string; name: string }[];
  now: number;
}) {
  const busy = new Set(working.map((w) => w.agentId)).size;
  const recent = agents
    .map((a) => ({ agent: a, last: lastSeen.get(a.id) ?? null }))
    .sort((a, b) => String(b.last?.ts ?? "").localeCompare(String(a.last?.ts ?? "")))
    .slice(0, 8);

  return (
    <section className={CARD}>
      <PanelHeader
        title="Working now"
        aside={<span className={MUTED}>{busy > 0 ? `${busy} of ${agents.length} agents busy` : `${agents.length} agents idle`}</span>}
      />
      {working.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {working.map((w) => (
            <li key={`${w.agentId}|${w.runId}|${w.nodeId}`} className="flex items-start gap-3 rounded-lg bg-white/5 p-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400" />
              <div className="min-w-0">
                <Link href={agentHref(w.agentId)} className="font-medium hover:underline">
                  {w.agentId}
                </Link>
                <div className="truncate text-sm text-[color:var(--ck-text-secondary)]">
                  {w.runId && w.workflowId ? (
                    <Link href={runHref(w.teamId, w.workflowId, w.runId)} className="hover:underline">
                      {stepLabel(w.workflowName ?? w.workflowId, w.nodeId)}
                    </Link>
                  ) : (
                    stepLabel(w.workflowName, w.nodeId)
                  )}
                </div>
                <div className={MUTED}>
                  since {ago(w.since, now)} · {w.source === "claim" ? "claimed by a worker" : "running in its workflow"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-[color:var(--ck-text-secondary)]">
            Nothing running. Workers pick up queued steps on their cron tick — here is what each agent did last.
          </p>
          <ul className="mt-2 divide-y divide-[color:var(--ck-border-subtle)]">
            {recent.map(({ agent, last }) => (
              <li key={agent.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <Link href={agentHref(agent.id)} className="shrink-0 text-sm hover:underline">
                  {agent.name}
                </Link>
                <span className="truncate text-xs text-[color:var(--ck-text-tertiary)]">
                  {last
                    ? `${human(last.status)} · ${stepLabel(last.workflowName ?? last.workflowId, last.nodeId)} · ${ago(last.ts, now)}`
                    : "no workflow steps yet"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function WorkflowsPanel({ installed, runs, now }: { installed: InstalledWorkflow[]; runs: RunGraph[]; now: number }) {
  const counts = new Map<string, number>();
  for (const r of runs) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const parked = counts.get("awaiting_approval") ?? 0;
  const recent = [...runs].sort((a, b) => b.runId.localeCompare(a.runId)).slice(0, 5);

  return (
    <section className={CARD}>
      <PanelHeader title="Workflows" aside={<Link href="/workflows" className={LINK_MUTED}>all workflows →</Link>} />
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs">{installed.length} installed</span>
        {[...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([status, count]) => (
            <span key={status} className={`rounded-full px-2.5 py-1 text-xs ${badge(status)}`}>
              {count} {human(status)}
            </span>
          ))}
      </div>
      {parked > 0 ? (
        <Link
          href="/workflows"
          className="mt-3 block rounded-lg border border-amber-400/30 bg-amber-500/10 p-2.5 text-sm text-amber-100 hover:bg-amber-500/15"
        >
          {plural(parked, "run")} waiting on your approval →
        </Link>
      ) : null}
      <ul className="mt-3 space-y-1.5">
        {recent.map((r) => (
          <li key={`${r.teamId}/${r.runId}`} className="flex items-baseline justify-between gap-3 text-sm">
            <Link href={runHref(r.teamId, r.workflowId, r.runId)} className="truncate hover:underline">
              {r.workflowName ?? r.workflowId}
            </Link>
            <span className="flex shrink-0 items-center gap-2">
              <span className={MUTED}>{ago(r.updatedAt ?? r.createdAt, now)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${badge(r.status)}`}>{human(r.status)}</span>
            </span>
          </li>
        ))}
        {recent.length === 0 ? <li className="text-sm text-[color:var(--ck-text-tertiary)]">No runs yet.</li> : null}
      </ul>
    </section>
  );
}

export function AttentionPanel({ items }: { items: Attention[] }) {
  return (
    <section className={CARD}>
      <PanelHeader title="Needs attention" aside={<span className={MUTED}>{items.length ? `${items.length} to look at` : "all clear"}</span>} />
      {items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-[color:var(--ck-text-secondary)]">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Nothing waiting on you: no stale approvals, failed runs, stuck workers or queue backlogs.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const body = (
              <>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.level === "fail" ? "bg-red-400" : "bg-amber-400"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-[color:var(--ck-text-tertiary)]">{item.detail}</span>
                </span>
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-white/5">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-2 p-1.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const LANES: { key: keyof TeamSummary["tickets"]; label: string; lane: string }[] = [
  { key: "backlog", label: "backlog", lane: "backlog" },
  { key: "inProgress", label: "in progress", lane: "in-progress" },
  { key: "testing", label: "testing", lane: "testing" },
  { key: "done", label: "done", lane: "done" },
];

function TeamCard({ team, selected }: { team: TeamSummary; selected: boolean }) {
  return (
    <SelectTeamLink
      teamId={team.id}
      current={selected}
      className={`rounded-xl border p-3 transition-colors ${
        selected ? "border-white/30 bg-white/10" : "border-[color:var(--ck-border-subtle)] bg-white/[0.03] hover:bg-white/[0.07]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium leading-tight">{team.name}</span>
        {selected ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--ck-accent-red)]" /> : null}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-[color:var(--ck-text-tertiary)]">{team.id}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--ck-text-secondary)]">
        <span className="tabular-nums">{plural(team.agents.length, "agent")}</span>
        {team.missingRoles.length > 0 ? (
          <span className="text-amber-300" title={`Roles with no agent: ${team.missingRoles.join(", ")}`}>
            {team.missingRoles.length} missing
          </span>
        ) : null}
        {team.lead ? <span className="truncate text-[color:var(--ck-text-tertiary)]">lead: {team.lead}</span> : null}
      </div>
    </SelectTeamLink>
  );
}

export function TeamsPanel({ teams, selectedId }: { teams: TeamSummary[]; selectedId: string }) {
  const team = teams.find((t) => t.id === selectedId) ?? teams[0];
  if (!team) {
    return (
      <section className={CARD}>
        <PanelHeader title="Teams" />
        <p className="mt-2 text-sm text-[color:var(--ck-text-tertiary)]">
          No teams yet. <Link href="/recipes" className="hover:underline">Install one from a recipe →</Link>
        </p>
      </section>
    );
  }
  const teamQuery = `team=${encodeURIComponent(team.id)}`;

  return (
    <section className={CARD}>
      <PanelHeader title="Teams" aside={<Link href={`/teams/${encodeURIComponent(team.id)}`} className={LINK_MUTED}>open team →</Link>} />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => (
          <TeamCard key={t.id} team={t} selected={t.id === team.id} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <dl className="space-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-[color:var(--ck-text-tertiary)]">lead</dt>
            <dd>{team.lead ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-[color:var(--ck-text-tertiary)]">members</dt>
            <dd className="flex flex-wrap gap-1.5">
              {team.agents.length === 0
                ? "—"
                : team.agents.map((a) => (
                    <Link key={a.id} href={agentHref(a.id)} className="rounded bg-white/5 px-1.5 py-0.5 hover:bg-white/10">
                      {a.name}
                    </Link>
                  ))}
            </dd>
          </div>
          {team.missingRoles.length > 0 ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-[color:var(--ck-text-tertiary)]">missing</dt>
              <dd className="text-amber-300">{team.missingRoles.join(", ")}</dd>
            </div>
          ) : null}
        </dl>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={LABEL}>Board</h3>
            <Link href={`/tickets?${teamQuery}`} className={LINK_MUTED}>
              open board →
            </Link>
          </div>
          <ul className="mt-2 space-y-1.5">
            {LANES.map((lane) => (
              <li key={lane.key}>
                <Link
                  href={`/tickets?${teamQuery}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm hover:bg-white/10"
                >
                  <span>{lane.label}</span>
                  <span className="tabular-nums text-[color:var(--ck-text-tertiary)]">{team.tickets[lane.key]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function PluginsPanel({ plugins }: { plugins: DashboardPlugin[] }) {
  return (
    <section className={CARD}>
      <PanelHeader title="Plugins" aside={<span className={MUTED}>{plural(plugins.length, "Kitchen plugin")}</span>} />
      <ul className="mt-3 space-y-2">
        {plugins.map((p) => (
          <li key={p.id} className="rounded-lg bg-white/5 p-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{p.name}</span>
              <span className="font-mono text-[11px] text-[color:var(--ck-text-tertiary)]">{p.id}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-[color:var(--ck-text-tertiary)]">
              {p.tabs.length ? `tabs: ${p.tabs.join(", ")}` : "no tabs"}
              {p.teamTypes.length ? ` · for ${p.teamTypes.join(", ")}` : ""}
            </div>
          </li>
        ))}
        {plugins.length === 0 ? <li className="text-sm text-[color:var(--ck-text-tertiary)]">No Kitchen plugins installed.</li> : null}
      </ul>
    </section>
  );
}
