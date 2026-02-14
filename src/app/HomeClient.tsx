"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type AgentListItem = {
  id: string;
  identityName?: string;
  workspace?: string;
  model?: string;
  isDefault?: boolean;
};

function inferTeamIdFromWorkspace(workspace: string | undefined) {
  if (!workspace) return null;
  const base = workspace.split("/").filter(Boolean).pop() ?? "";
  if (!base.startsWith("workspace-")) return null;
  const team = base.slice("workspace-".length);
  return team || null;
}

function normalizeTeamId(teamId: string) {
  // Support legacy workspaces that used a "-team" suffix.
  return teamId.endsWith("-team") ? teamId.slice(0, -"-team".length) : teamId;
}

export default function HomeClient({
  agents,
  teamNames,
  customTeams,
}: {
  agents: AgentListItem[];
  teamNames: Record<string, string>;
  customTeams: Array<{ teamId: string; name: string; recipeId: string }>;
}) {
  const teamIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of agents) {
      const t = inferTeamIdFromWorkspace(a.workspace);
      if (t) s.add(t);
    }
    return Array.from(s).sort();
  }, [agents]);

  const [teamFilter, setTeamFilter] = useState<string>("all");

  const grouped = useMemo(() => {
    const groups = new Map<string, AgentListItem[]>();

    function displayNameFor(teamId: string) {
      const normalized = normalizeTeamId(teamId);
      return teamNames[teamId] || teamNames[normalized] || teamId;
    }

    for (const a of agents) {
      const teamId = inferTeamIdFromWorkspace(a.workspace) ?? "personal";
      if (teamFilter !== "all" && teamId !== teamFilter) continue;
      const key = teamId;
      const list = groups.get(key) ?? [];
      list.push(a);
      groups.set(key, list);
    }

    // Stable ordering: teams first (alphabetical), then personal.
    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === "personal") return 1;
      if (b === "personal") return -1;
      return a.localeCompare(b);
    });

    return keys.map((k) => {
      const display = k === "personal" ? "Personal / Unassigned" : displayNameFor(k);
      return {
        key: k,
        title: display,
        // Keep the raw id visible, but deemphasize it.
        subtitle: k === "personal" ? null : normalizeTeamId(k),
        agents: (groups.get(k) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id)),
        isTeam: k !== "personal",
      };
    });
  }, [agents, teamFilter, teamNames]);

  return (
    <div className="ck-glass mx-auto max-w-5xl p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Claw Kitchen{" "}
            <span className="text-sm align-middle text-[color:var(--ck-text-secondary)]">(v2)</span>
          </h1>
          <p className="mt-2 max-w-prose text-[color:var(--ck-text-secondary)]">
            Installed agents on this machine, grouped by team workspace when available.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Link
            href="/recipes"
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
          >
            Recipes
          </Link>
          <Link
            href="/tickets"
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
          >
            Tickets
          </Link>
          <Link
            href="/settings"
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
          >
            Settings
          </Link>
        </div>
      </div>

      {teamIds.length ? (
        <div className="mt-6">
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Team filter</label>
          <select
            className="mt-2 w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-[color:var(--ck-bg-glass)] px-3 py-2 text-sm text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] sm:w-[280px]"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="all">All teams</option>
            {teamIds.map((t) => {
              const label = teamNames[t] || teamNames[normalizeTeamId(t)] || t;
              return (
                <option key={t} value={t}>
                  {label}
                </option>
              );
            })}
            <option value="personal">Personal / Unassigned</option>
          </select>
        </div>
      ) : null}

      {customTeams.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ck-text-primary)]">Teams</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {customTeams.map((t) => (
              <Link
                key={t.teamId}
                href={`/teams/${encodeURIComponent(t.teamId)}`}
                className="ck-glass block px-4 py-3 transition-colors hover:bg-[color:var(--ck-bg-glass-strong)]"
              >
                <div className="truncate font-medium text-[color:var(--ck-text-primary)]">{t.name}</div>
                <div className="mt-1 truncate text-xs text-[color:var(--ck-text-secondary)]">{t.teamId}</div>
                <div className="mt-1 truncate text-xs text-[color:var(--ck-text-tertiary)]">Recipe: {t.recipeId}</div>
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
            Teams appear here when you have a workspace custom team recipe (custom-*), even before you scaffold the team.
          </p>
        </section>
      ) : null}

      <div className="mt-8 space-y-8">
        {grouped.map((g) => (
          <section key={g.key}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight text-[color:var(--ck-text-primary)]">{g.title}</h2>
                {g.subtitle ? (
                  <div className="mt-0.5 truncate text-xs text-[color:var(--ck-text-secondary)]">{g.subtitle}</div>
                ) : null}
              </div>
              {g.isTeam ? (
                <Link
                  href={`/teams/${encodeURIComponent(g.key)}`}
                  className="rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-[color:var(--ck-bg-glass)] px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[color:var(--ck-bg-glass-strong)]"
                >
                  Edit
                </Link>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.agents.map((a) => (
                <Link
                  key={a.id}
                  href={`/agents/${encodeURIComponent(a.id)}`}
                  className="ck-glass block px-4 py-3 transition-colors hover:bg-[color:var(--ck-bg-glass-strong)]"
                >
                  <div className="truncate font-medium text-[color:var(--ck-text-primary)]">
                    {a.identityName || a.id}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">
                    {a.id}
                    {a.isDefault ? " • default" : ""}
                  </div>
                  {a.model ? (
                    <div className="mt-1 truncate text-xs text-[color:var(--ck-text-tertiary)]">{a.model}</div>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-10 text-xs text-[color:var(--ck-text-tertiary)]">
        Note: Team detection currently uses the convention <code>~/.openclaw/workspace-&lt;teamId&gt;</code>.
      </p>
    </div>
  );
}
