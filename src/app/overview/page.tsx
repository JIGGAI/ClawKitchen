import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { runOpenClaw } from "@/lib/openclaw";
import { listRecipes } from "@/lib/recipes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AgentListItem = {
  id: string;
  identityName?: string | null;
  workspace?: string | null;
};

type SessionListItem = {
  key: string;
  updatedAt: number;
  ageMs?: number;
  agentId: string;
  kind?: string;
  model?: string;
  contextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

function inferTeamIdFromWorkspace(workspace: string | null | undefined) {
  if (!workspace) return null;
  const parts = workspace.split("/").filter(Boolean);
  const wsPart = parts.find((p) => p.startsWith("workspace-")) ?? "";
  if (!wsPart) return null;
  const team = wsPart.slice("workspace-".length);
  return team || null;
}

async function getAgents(): Promise<AgentListItem[]> {
  const res = await runOpenClaw(["agents", "list", "--json"]);
  if (!res.ok) return [];
  return JSON.parse(res.stdout) as AgentListItem[];
}

async function getTeamsFromRecipes(): Promise<{ teamNames: Record<string, string> }> {
  const items = await listRecipes();
  const teamNames: Record<string, string> = {};
  for (const r of items) {
    if (r.kind !== "team") continue;
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    teamNames[r.id] = name;
  }
  return { teamNames };
}

async function getActiveSessions(minutes: number): Promise<SessionListItem[]> {
  const res = await runOpenClaw(["sessions", "--active", String(minutes), "--all-agents", "--json"]);
  if (!res.ok) return [];
  const parsed = JSON.parse(res.stdout) as { sessions?: SessionListItem[] };
  return Array.isArray(parsed.sessions) ? parsed.sessions : [];
}

function formatAgeMs(ms: number | undefined) {
  if (ms == null) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

function displayNameForTeam(teamId: string, teamNames: Record<string, string>) {
  const fallback = teamId
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return teamNames[teamId] || fallback || teamId;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();

  const sp = (await searchParams) ?? {};
  const teamRaw = sp.team;
  const team = (Array.isArray(teamRaw) ? teamRaw[0] : teamRaw) || "";
  const teamFilter = team.trim();

  const [agents, sessions60, { teamNames }] = await Promise.all([
    getAgents(),
    getActiveSessions(60),
    getTeamsFromRecipes(),
  ]);

  const agentsById = new Map(agents.map((a) => [a.id, a] as const));

  const sessionsFiltered = sessions60.filter((s) => {
    if (!teamFilter) return true;
    const a = agentsById.get(s.agentId);
    const t = inferTeamIdFromWorkspace(a?.workspace ?? null);
    return t === teamFilter;
  });

  const installedAgents = teamFilter
    ? agents.filter((a) => inferTeamIdFromWorkspace(a.workspace ?? null) === teamFilter)
    : agents;

  const activeSessions = sessionsFiltered.length;

  const kpi = [
    {
      label: "Active Sessions (last 60m)",
      value: String(activeSessions),
      note: teamFilter ? `team=${teamFilter}` : "all teams",
    },
    {
      label: "Agents (installed)",
      value: String(installedAgents.length),
      note: teamFilter ? displayNameForTeam(teamFilter, teamNames) : "all teams",
    },
    {
      label: "Tasks Running",
      value: "—",
      note: "not wired yet",
    },
    {
      label: "Errors (24h)",
      value: "—",
      note: "not wired yet",
    },
  ];

  const sessionsPreview = sessionsFiltered
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8);

  return (
    <div className="ck-glass w-full p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mission Control</h1>
          <p className="mt-2 max-w-prose text-[color:var(--ck-text-secondary)]">
            A live overview of your OpenClaw system. Data is real when available; otherwise we show explicit unknowns.
          </p>
          <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
            Tip: filter by team via <code>?team=&lt;teamId&gt;</code>.
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Link
            href={teamFilter ? `/teams/${encodeURIComponent(teamFilter)}` : "/"}
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
          >
            {teamFilter ? "Team →" : "Home →"}
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpi.map((t) => (
          <div key={t.label} className="ck-glass px-4 py-3">
            <div className="text-xs text-[color:var(--ck-text-secondary)]">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ck-text-primary)]">{t.value}</div>
            <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">{t.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="ck-glass lg:col-span-4 px-4 py-3">
          <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">System Health</div>
          <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
            Gateway status and deeper health checks are not yet surfaced here.
          </div>
          <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
            Next step: wire <code>openclaw gateway status</code> + worker/cron heartbeat summaries.
          </div>
        </section>

        <section className="ck-glass lg:col-span-4 px-4 py-3">
          <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">Security &amp; Audit</div>
          <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">No audit feed wired yet.</div>
          <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">Empty state (intentional): no fake data.</div>
        </section>

        <section className="ck-glass lg:col-span-4 px-4 py-3">
          <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">Backup &amp; Pipelines</div>
          <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">No backup pipeline status wired yet.</div>
          <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">Empty state (intentional): no fake data.</div>
        </section>

        <section className="ck-glass lg:col-span-12 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">Recent Sessions</div>
              <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
                Showing last 60 minutes{teamFilter ? ` for team ${teamFilter}` : ""}.
              </div>
            </div>
          </div>

          {sessionsPreview.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs text-[color:var(--ck-text-tertiary)]">
                  <tr>
                    <th className="py-2 pr-4">Agent</th>
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Age</th>
                    <th className="py-2 pr-4">Total tokens</th>
                    <th className="py-2 pr-4">Context</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsPreview.map((s) => (
                    <tr key={s.key} className="border-t border-[color:var(--ck-border-subtle)]">
                      <td className="py-2 pr-4 text-[color:var(--ck-text-primary)]">{s.agentId}</td>
                      <td className="py-2 pr-4 text-[color:var(--ck-text-secondary)]">{s.model || "—"}</td>
                      <td className="py-2 pr-4 text-[color:var(--ck-text-secondary)]">{formatAgeMs(s.ageMs)}</td>
                      <td className="py-2 pr-4 text-[color:var(--ck-text-secondary)]">{s.totalTokens ?? "—"}</td>
                      <td className="py-2 pr-4 text-[color:var(--ck-text-secondary)]">{s.contextTokens ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">No recent sessions.</div>
          )}
        </section>

        <section className="ck-glass lg:col-span-12 px-4 py-3">
          <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">Recent Logs</div>
          <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
            Not wired yet. This will likely surface the last N lines of gateway + worker logs with filters.
          </div>
          <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">Empty state (intentional): no fake data.</div>
        </section>
      </div>
    </div>
  );
}
