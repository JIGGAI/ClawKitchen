"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "@/lib/fetch-json";
import { OrchestratorSetupModal } from "./OrchestratorSetupModal";

type OrchestratorState =
  | {
      ok: true;
      teamId: string;
      present: false;
      reason?: string;
    }
  | {
      ok: true;
      teamId: string;
      present: true;
      agent: { id: string; identityName?: string; workspace: string };
      tmuxSessions: Array<{ name: string; attached: boolean; windows?: number; created?: string }>;
      worktrees: Array<{ path: string; branch?: string; sha?: string }>;
      activeTasksSummary: null | { path: string; taskCount?: number; rawType?: string };
      settingsPaths: string[];
    }
  | {
      ok: false;
      error: string;
    };

export function OrchestratorPanel({ teamId }: { teamId: string }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<OrchestratorState | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await fetchJson<OrchestratorState>(
        `/api/teams/orchestrator?teamId=${encodeURIComponent(teamId)}`,
        { cache: "no-store" }
      );
      setState(json);
      setLastLoadedAt(new Date().toISOString());
    } catch (e: unknown) {
      setState({ ok: false, error: e instanceof Error ? e.message : String(e) });
      setLastLoadedAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="mt-6 ck-card p-4">Loading orchestrator state…</div>;
  }

  if (!state) {
    return <div className="mt-6 ck-card p-4">No orchestrator state available.</div>;
  }

  if (!state.ok) {
    return (
      <div className="mt-6 ck-card p-4">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Orchestrator</div>
        <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
          {state.error}
        </div>
      </div>
    );
  }

  if (!state.present) {
    return (
      <div className="mt-6 ck-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Orchestrator</div>
            <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">No swarm/orchestrator detected for this team.</p>
          </div>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)]"
          >
            Add Orchestrator
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--ck-text-secondary)]">
          <div className="text-xs font-medium text-[color:var(--ck-text-tertiary)]">Detection</div>
          <div className="mt-1 font-mono text-xs">{state.reason || "(no reason provided)"}</div>
        </div>

        <p className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">
          Default convention is <code>&lt;teamId&gt;-swarm-orchestrator</code>. Once installed, this tab will show: tmux sessions,
          git worktrees/branches, and active task state.
        </p>

        <OrchestratorSetupModal
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          teamId={teamId}
          onInstalled={() => {
            setSetupOpen(false);
            void load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mt-6 ck-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Orchestrator</div>
          <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">
            Agent: <span className="font-mono">{state.agent.id}</span>
            {state.agent.identityName ? ` (${state.agent.identityName})` : ""}
          </div>
          <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">
            Workspace: <span className="font-mono">{state.agent.workspace}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">
            {lastLoadedAt ? (
              <span>
                Last updated: <span className="font-mono">{lastLoadedAt}</span>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">tmux sessions</div>
          {state.tmuxSessions.length ? (
            <ul className="mt-2 space-y-2">
              {state.tmuxSessions.map((s) => (
                <li key={s.name} className="text-sm text-[color:var(--ck-text-secondary)]">
                  <span className="font-mono">{s.name}</span>
                  <span className="ml-2 text-xs text-[color:var(--ck-text-tertiary)]">
                    attached={String(s.attached)}
                    {typeof s.windows === "number" ? ` windows=${s.windows}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">No sessions detected (or tmux not running).</div>
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">git worktrees</div>
          {state.worktrees.length ? (
            <ul className="mt-2 space-y-2">
              {state.worktrees.map((w) => (
                <li key={w.path} className="text-sm text-[color:var(--ck-text-secondary)]">
                  <div className="font-mono text-xs">{w.path}</div>
                  <div className="text-xs text-[color:var(--ck-text-tertiary)]">
                    {w.branch ? w.branch : "(no branch)"}
                    {w.sha ? ` @ ${w.sha.slice(0, 7)}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">No worktrees detected.</div>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Active tasks</div>
        {state.activeTasksSummary ? (
          <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
            <div className="font-mono text-xs">{state.activeTasksSummary.path}</div>
            <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
              {typeof state.activeTasksSummary.taskCount === "number" ? `tasks=${state.activeTasksSummary.taskCount}` : "tasks=?"}
              {state.activeTasksSummary.rawType ? ` type=${state.activeTasksSummary.rawType}` : ""}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">No active-tasks.json found.</div>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">CLI quick actions</div>
        <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
          The orchestrator is designed to be driven from the CLI (and usually tmux). Common commands:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
          <li>
            <span className="font-mono text-xs">tmux ls</span>
            <span className="ml-2 text-xs text-[color:var(--ck-text-tertiary)]">(list sessions)</span>
          </li>
          <li>
            <span className="font-mono text-xs">tmux attach -t &lt;session&gt;</span>
            <span className="ml-2 text-xs text-[color:var(--ck-text-tertiary)]">(jump into a running swarm)</span>
          </li>
          <li>
            <span className="font-mono text-xs">git -C {state.agent.workspace} worktree list</span>
            <span className="ml-2 text-xs text-[color:var(--ck-text-tertiary)]">(inspect worktrees)</span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
          Note: ClawKitchen is read-only here; it surfaces status and pointers, but does not run or attach to tmux.
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Human approval gate (recommended)</div>
        <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
          For workflows that publish, deploy, or send outbound messages, keep a <strong>human approval step</strong>.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
          <li>Generate a proposed change/post as a draft.</li>
          <li>Send the draft to a bound messaging channel (e.g. Telegram) for approval.</li>
          <li>Only execute the final action after explicit approve/deny.</li>
        </ul>
      </section>

      <section className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Where to change settings</div>
        <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
          These are the common knobs for a swarm/orchestrator scaffold (read-only references):
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
          {state.settingsPaths.map((p) => (
            <li key={p} className="font-mono text-xs">
              {p}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
