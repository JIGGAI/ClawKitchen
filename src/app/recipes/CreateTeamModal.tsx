"use client";

import { createPortal } from "react-dom";

export function CreateTeamModal({
  open,
  recipeId,
  recipeName,
  teamId,
  setTeamId,
  installCron,
  setInstallCron,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  recipeId: string;
  recipeName: string;
  teamId: string;
  setTeamId: (v: string) => void;
  installCron: boolean;
  setInstallCron: (v: boolean) => void;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[color:var(--ck-bg-glass-strong)] p-5 shadow-[var(--ck-shadow-2)]">
            <div className="text-lg font-semibold text-[color:var(--ck-text-primary)]">Create team</div>
            <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
              Create a new team from recipe <code className="font-mono">{recipeId}</code>
              {recipeName ? (
                <>
                  {" "}(<span className="font-medium">{recipeName}</span>)
                </>
              ) : null}
              .
            </p>

            <div className="mt-4">
              <label className="text-sm font-medium text-[color:var(--ck-text-primary)]">Team id</label>
              <input
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                placeholder="e.g. my-team"
                className="mt-2 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
                autoFocus
              />
              <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                This will scaffold <code className="font-mono">~/.openclaw/workspace-&lt;teamId&gt;</code> and add the team to config.
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-[color:var(--ck-text-secondary)]">
              <input
                type="checkbox"
                checked={installCron}
                onChange={(e) => setInstallCron(e.target.checked)}
              />
              Install cron jobs from this recipe
            </label>

            {error ? (
              <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create team"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
