import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { getActiveSessions, getAgents, inferTeamIdFromWorkspace } from "@/lib/overview/overview-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtIso(tsMs: number | null) {
  if (!tsMs) return "—";
  try {
    return new Date(tsMs).toISOString().replace(".000Z", "Z");
  } catch {
    return "—";
  }
}

export default async function TasksRunningPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();

  const sp = (await searchParams) ?? {};
  const teamRaw = sp.team;
  const team = (Array.isArray(teamRaw) ? teamRaw[0] : teamRaw) || "";
  const teamFilter = team.trim();

  const [agents, sessions5] = await Promise.all([getAgents(), getActiveSessions(5)]);
  const agentsById = new Map(agents.map((a) => [a.id, a] as const));

  const sessionsFiltered = sessions5.filter((s) => {
    if (!teamFilter) return true;
    const a = agentsById.get(s.agentId);
    const t = inferTeamIdFromWorkspace(a?.workspace ?? null);
    return t === teamFilter;
  });

  const rows = sessionsFiltered
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => {
      const a = agentsById.get(s.agentId);
      const teamId = inferTeamIdFromWorkspace(a?.workspace ?? null);
      const startedAt = s.ageMs != null ? s.updatedAt - s.ageMs : null;
      const lastActivity = s.updatedAt;
      return {
        key: s.key,
        agentId: s.agentId,
        teamId: teamId ?? "—",
        model: s.model ?? "—",
        startedAt,
        lastActivity,
      };
    });

  const backHref = teamFilter ? `/overview?team=${encodeURIComponent(teamFilter)}` : `/overview`;

  return (
    <div className="ck-glass w-full p-6 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks Running</h1>
          <p className="mt-2 max-w-prose text-sm text-[color:var(--ck-text-secondary)]">
            This is a best-effort view: we treat “tasks” as OpenClaw sessions active in the last 5 minutes.
          </p>
          <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
            Filter: {teamFilter ? <code>team={teamFilter}</code> : <span>all teams</span>}
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Link
            href={backHref}
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
          >
            Overview →
          </Link>
        </div>
      </div>

      <section className="ck-glass mt-6 px-4 py-3">
        <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">
          Active sessions (last 5m) — {rows.length}
        </div>

        {rows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-[color:var(--ck-text-tertiary)]">
                <tr>
                  <th className="py-2 pr-4">sessionKey</th>
                  <th className="py-2 pr-4">agentId</th>
                  <th className="py-2 pr-4">teamId</th>
                  <th className="py-2 pr-4">model</th>
                  <th className="py-2 pr-4">start</th>
                  <th className="py-2 pr-4">last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-[color:var(--ck-border-subtle)]">
                    <td className="py-2 pr-4 font-mono text-xs text-[color:var(--ck-text-primary)]">{r.key}</td>
                    <td className="py-2 pr-4 text-[color:var(--ck-text-secondary)]">{r.agentId}</td>
                    <td className="py-2 pr-4 text-[color:var(--ck-text-secondary)]">{r.teamId}</td>
                    <td className="py-2 pr-4 text-[color:var(--ck-text-secondary)]">{r.model}</td>
                    <td className="py-2 pr-4 text-[color:var(--ck-text-secondary)]">{fmtIso(r.startedAt)}</td>
                    <td className="py-2 pr-4 text-[color:var(--ck-text-secondary)]">{fmtIso(r.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">No active sessions in the last 5 minutes.</div>
        )}

        <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
          Source: <code>openclaw sessions --active 5 --all-agents --json</code>
        </div>
      </section>
    </div>
  );
}
