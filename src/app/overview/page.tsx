import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { execFileAsync } from "@/lib/exec";
import { inferTeamIdFromWorkspace, getActiveSessions, getAgents } from "@/lib/overview/overview-data";
import { runOpenClaw } from "@/lib/openclaw";
import { listRecipes } from "@/lib/recipes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type GatewayStatusSummary = {
  ok: boolean;
  statusLabel: string;
  configOk: boolean;
  rpcOk: boolean;
  portStatus?: string;
};


type GatewayStatusJson = {
  service?: {
    runtime?: { status?: string; state?: string };
    configAudit?: { ok?: boolean };
  };
  rpc?: { ok?: boolean };
  port?: { status?: string };
};

async function getGatewayStatusSummary(): Promise<GatewayStatusSummary> {
  const res = await runOpenClaw(["gateway", "status", "--json"]);
  if (!res.ok) {
    return {
      ok: false,
      statusLabel: "unknown",
      configOk: false,
      rpcOk: false,
    };
  }

  const parsed = JSON.parse(res.stdout) as GatewayStatusJson;
  const runtimeStatus = String(parsed?.service?.runtime?.status ?? "unknown");
  const runtimeState = String(parsed?.service?.runtime?.state ?? "unknown");
  const configOk = Boolean(parsed?.service?.configAudit?.ok);
  const rpcOk = Boolean(parsed?.rpc?.ok);
  const portStatus = String(parsed?.port?.status ?? "unknown");

  const running = runtimeStatus === "running" && runtimeState === "active";
  const ok = running && configOk && rpcOk;

  return {
    ok,
    statusLabel: running ? "running" : runtimeStatus,
    configOk,
    rpcOk,
    portStatus,
  };
}

let cachedGatewayErrCount: { ts: number; value: number | null } = { ts: 0, value: null };

async function getGatewayErrorsLast24h(): Promise<number | null> {
  // journalctl can be expensive; cache for 60s per server instance.
  const now = Date.now();
  if (now - cachedGatewayErrCount.ts < 60_000) return cachedGatewayErrCount.value;

  try {
    const { stdout } = await execFileAsync(
      "bash",
      [
        "-lc",
        "journalctl --user -u openclaw-gateway --since '24 hours ago' -p err --no-pager 2>/dev/null | wc -l",
      ],
      { encoding: "utf8", timeout: 5_000 },
    );
    const n = Number(String(stdout).trim());
    const value = Number.isFinite(n) ? n : null;
    cachedGatewayErrCount = { ts: now, value };
    return value;
  } catch {
    cachedGatewayErrCount = { ts: now, value: null };
    return null;
  }
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
  const fallback = teamId.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
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

  const [agents, sessions60, sessions5, { teamNames }, gateway, gatewayErr24h] = await Promise.all([
    getAgents(),
    getActiveSessions(60),
    getActiveSessions(5),
    getTeamsFromRecipes(),
    getGatewayStatusSummary(),
    getGatewayErrorsLast24h(),
  ]);

  const agentsById = new Map(agents.map((a) => [a.id, a] as const));

  const sessionsFiltered = sessions60.filter((s) => {
    if (!teamFilter) return true;
    const a = agentsById.get(s.agentId);
    const t = inferTeamIdFromWorkspace(a?.workspace ?? null);
    return t === teamFilter;
  });

  const sessions5Filtered = sessions5.filter((s) => {
    if (!teamFilter) return true;
    const a = agentsById.get(s.agentId);
    const t = inferTeamIdFromWorkspace(a?.workspace ?? null);
    return t === teamFilter;
  });

  const installedAgents = teamFilter
    ? agents.filter((a) => inferTeamIdFromWorkspace(a.workspace ?? null) === teamFilter)
    : agents;

  const activeSessions = sessionsFiltered.length;
  const tasksRunning = sessions5Filtered.length;

  const tasksHref = teamFilter
    ? `/overview/tasks?team=${encodeURIComponent(teamFilter)}`
    : `/overview/tasks`;

  const kpi: Array<{ label: string; value: string; note: string; href?: string }> = [
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
      value: String(tasksRunning),
      note: "active sessions (last 5m)",
      href: tasksHref,
    },
    {
      label: "Errors (24h)",
      value: gatewayErr24h == null ? "—" : String(gatewayErr24h),
      note: "gateway journalctl -p err",
    },
  ];

  const sessionsPreview = sessionsFiltered.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);

  return (
    <div className="ck-glass w-full p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Kitchen Sink</h1>
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
            <div className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ck-text-primary)]">
              {t.href ? (
                <Link
                  href={t.href}
                  className="underline decoration-white/20 underline-offset-4 transition-colors hover:decoration-white/50"
                  title="View details"
                >
                  {t.value}
                </Link>
              ) : (
                t.value
              )}
            </div>
            <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">{t.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="ck-glass lg:col-span-4 px-4 py-3">
          <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">System Health</div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-[color:var(--ck-text-tertiary)]">Gateway</div>
              <div className="mt-1 font-medium text-[color:var(--ck-text-primary)]">
                {gateway.statusLabel}
                {!gateway.ok ? (
                  <span className="ml-2 text-xs text-[color:var(--ck-text-secondary)]">(degraded)</span>
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-xs text-[color:var(--ck-text-tertiary)]">RPC</div>
              <div className="mt-1 font-medium text-[color:var(--ck-text-primary)]">{gateway.rpcOk ? "ok" : "not ok"}</div>
            </div>
            <div>
              <div className="text-xs text-[color:var(--ck-text-tertiary)]">Config audit</div>
              <div className="mt-1 font-medium text-[color:var(--ck-text-primary)]">
                {gateway.configOk ? "ok" : "issues"}
              </div>
            </div>
            <div>
              <div className="text-xs text-[color:var(--ck-text-tertiary)]">Port</div>
              <div className="mt-1 font-medium text-[color:var(--ck-text-primary)]">{gateway.portStatus ?? "—"}</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
            Source: <code>openclaw gateway status --json</code>
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
