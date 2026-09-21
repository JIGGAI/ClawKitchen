import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { lastSeenByAgent, needsAttention, teamSummaries, workingNow } from "@/lib/dashboard/activity";
import { loadDashboard } from "@/lib/dashboard/overview";
import { AttentionPanel, PluginsPanel, StatCard, TeamsPanel, WorkflowsPanel, WorkingNow } from "./panels";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** What this install is, and what it is doing — read from its files on every load. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const sp = await searchParams;
  const selectedTeam = String((Array.isArray(sp.team) ? sp.team[0] : sp.team) ?? "").trim();

  const data = await loadDashboard();
  const { now, manifest, runs, installed, queues, plugins } = data;
  const teams = manifest ? teamSummaries(manifest) : [];
  const agents = (manifest?.agents ?? []).map((a) => ({ id: a.id, name: a.identityName ?? a.id }));
  const working = workingNow(queues, runs, now);
  const busy = new Set(working.map((w) => w.agentId)).size;
  const attention = needsAttention({ runs, queues, manifestGeneratedAt: manifest?.generatedAt ?? null, now });
  const queued = queues.reduce((n, q) => n + q.pending.length, 0);
  const parked = runs.filter((r) => r.status === "awaiting_approval").length;
  const tabCount = plugins.reduce((n, p) => n + p.tabs.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-[color:var(--ck-text-tertiary)]">Read from your workspace files at load — nothing here is cached.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Teams"
          value={teams.length}
          href="/agents"
          hint={teams.length ? teams.slice(0, 2).map((t) => t.name).join(", ") : "none yet"}
        />
        <StatCard label="Agents" value={agents.length} href="/agents" hint={`${busy} working now`} />
        <StatCard
          label="Workflows"
          value={installed.length}
          href="/workflows"
          hint={parked ? `${parked} awaiting approval` : `${runs.length} runs recorded`}
        />
        <StatCard label="Plugins" value={plugins.length} hint={`${tabCount} tabs`} />
      </div>

      {queued > 0 ? (
        <Link
          href="/cron-jobs"
          className="block rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 text-sm text-sky-100 hover:bg-sky-500/15"
        >
          {queued} task{queued === 1 ? "" : "s"} queued for workers →
        </Link>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WorkingNow working={working} lastSeen={lastSeenByAgent(runs)} agents={agents} now={now} />
        <WorkflowsPanel installed={installed} runs={runs} now={now} />
      </div>

      <AttentionPanel items={attention} />

      <TeamsPanel teams={teams} selectedId={selectedTeam} />

      <PluginsPanel plugins={plugins} />
    </div>
  );
}
