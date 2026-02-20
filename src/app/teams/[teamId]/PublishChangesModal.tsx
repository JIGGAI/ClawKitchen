"use client";

import { createPortal } from "react-dom";

export function PublishChangesModal({
  open,
  teamId,
  recipeId,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  teamId: string;
  recipeId: string;
  busy?: boolean;
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
            <div className="text-lg font-semibold text-[color:var(--ck-text-primary)]">Publish changes</div>
            <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
              This will re-scaffold team <code className="font-mono">{teamId}</code> from recipe <code className="font-mono">{recipeId}</code>.
            </p>

            <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="font-medium">Complete overwrite</div>
              <div className="mt-1">
                All existing team workspace files managed by the recipe will be overwritten (for example: <code className="font-mono">AGENTS.md</code>,{" "}
                <code className="font-mono">SOUL.md</code>, role templates, and other scaffolded files). Any manual edits in those files will be lost.
              </div>
            </div>

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
                className="rounded-[var(--ck-radius-sm)] bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? "Publishing…" : "Publish changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
