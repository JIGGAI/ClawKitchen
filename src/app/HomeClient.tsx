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
  const parts = workspace.split("/").filter(Boolean);
  // Team workspaces are typically ~/.openclaw/workspace-<teamId>/..., so the workspace- segment
  // is not always the last path component.
  const wsPart = parts.find((p) => p.startsWith("workspace-")) ?? "";
  if (!wsPart) return null;
  const team = wsPart.slice("workspace-".length);
  return team || null;
}

function normalizeTeamId(teamId: string) {
  // Support legacy workspaces that used a "-team" suffix.
  return teamId.endsWith("-team") ? teamId.slice(0, -"-team".length) : teamId;
}

export default function HomeClient({
  agents,
  teamNames,
}: {
  agents: AgentListItem[];
  teamNames: Record<string, string>;
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

    function titleCaseId(id: string) {
      const s = id
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!s) return id;
      return s
        .split(" ")
        .map((w) => {
          if (/^(ai|api|cli|ui|ux|sre|qa|devops)$/i.test(w)) return w.toUpperCase();
          return w.slice(0, 1).toUpperCase() + w.slice(1);
        })
        .join(" ");
    }

    function displayNameFor(teamId: string) {
      const normalized = normalizeTeamId(teamId);
      return teamNames[teamId] || teamNames[normalized] || titleCaseId(normalized);
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
        subtitle: k === "personal" ? null : `workspace-${k}`,
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
