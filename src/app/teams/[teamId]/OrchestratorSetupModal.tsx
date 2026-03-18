"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchJson } from "@/lib/fetch-json";

function slugifyId(input: string) {
  return String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export function OrchestratorSetupModal({
  open,
  onClose,
  teamId,
  onInstalled,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  onInstalled: () => void;
}) {
  const defaultAgentId = useMemo(() => `${teamId}-swarm-orchestrator`, [teamId]);
  const [agentId, setAgentId] = useState(defaultAgentId);
  const [repoDir, setRepoDir] = useState("");
  const [worktreeRoot, setWorktreeRoot] = useState(`~/swarm-worktrees/${teamId}`);
  const [baseRef, setBaseRef] = useState("origin/main");
  const [applyConfig, setApplyConfig] = useState(true);
  const [makeExecutable, setMakeExecutable] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ orchestratorAgentId: string; workspace: string } | null>(null);

  const normalized = useMemo(() => {
    const effectiveAgentId = slugifyId(agentId);
    return { effectiveAgentId };
  }, [agentId]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[210]">
      <div
        className="fixed inset-0 bg-black/60"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[color:var(--ck-bg-glass-strong)] p-5 shadow-[var(--ck-shadow-2)]">
            <div className="text-lg font-semibold text-[color:var(--ck-text-primary)]">Add Orchestrator</div>
            <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
              This will scaffold a new <span className="font-mono text-xs">swarm-orchestrator</span> agent workspace for this team and
              prefill its config.
            </p>

            <label className="mt-4 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Orchestrator agent id</label>
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />
            <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
              Default: <span className="font-mono">{defaultAgentId}</span> (normalized: <span className="font-mono">{normalized.effectiveAgentId}</span>)
            </div>

            <label className="mt-4 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Repo directory (SWARM_REPO_DIR)</label>
            <input
              value={repoDir}
              onChange={(e) => setRepoDir(e.target.value)}
              placeholder="~/my-project"
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Worktree root (SWARM_WORKTREE_ROOT)</label>
                <input
                  value={worktreeRoot}
                  onChange={(e) => setWorktreeRoot(e.target.value)}
                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                />
                <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">Recommend a dedicated folder outside the repo.</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Base ref (SWARM_BASE_REF)</label>
                <input
                  value={baseRef}
                  onChange={(e) => setBaseRef(e.target.value)}
                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                />
              </div>
            </div>

            <label className="mt-5 flex items-start gap-2 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--ck-text-secondary)]">
              <input type="checkbox" checked={applyConfig} onChange={(e) => setApplyConfig(e.target.checked)} className="mt-1" />
              <span>
                Add this agent to OpenClaw config (recommended).<br />
                <span className="text-xs text-[color:var(--ck-text-tertiary)]">
                  This will modify <span className="font-mono">~/.openclaw/openclaw.json</span> to add <span className="font-mono">{normalized.effectiveAgentId}</span>.
                </span>
              </span>
            </label>

            <label className="mt-3 flex items-start gap-2 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--ck-text-secondary)]">
              <input type="checkbox" checked={makeExecutable} onChange={(e) => setMakeExecutable(e.target.checked)} className="mt-1" />
              <span>
                Make scripts executable (developer convenience).<br />
                <span className="text-xs text-[color:var(--ck-text-tertiary)]">
                  Runs <span className="font-mono">chmod +x .clawdbot/*.sh</span> in the orchestrator workspace.
                </span>
              </span>
            </label>

            {error ? (
              <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
            ) : null}

            {result ? (
              <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                Installed <span className="font-mono">{result.orchestratorAgentId}</span> → <span className="font-mono">{result.workspace}</span>
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || !normalized.effectiveAgentId || !repoDir.trim()}
                onClick={async () => {
                  setSubmitting(true);
                  setError(null);
                  setResult(null);
                  try {
                    const json = await fetchJson<
                      | { ok: true; orchestratorAgentId: string; workspace: string }
                      | { ok: false; error: string }
                    >("/api/teams/orchestrator/install", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        teamId,
                        orchestratorAgentId: normalized.effectiveAgentId,
                        repoDir: repoDir.trim(),
                        worktreeRoot: worktreeRoot.trim(),
                        baseRef: baseRef.trim(),
                        applyConfig,
                        makeExecutable,
                      }),
                    });
                    if (!json.ok) throw new Error(json.error);
                    setResult({ orchestratorAgentId: json.orchestratorAgentId, workspace: json.workspace });
                    onInstalled();
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
              >
                {submitting ? "Installing…" : "Install"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  , document.body);
}
