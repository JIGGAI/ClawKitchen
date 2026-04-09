"use client";

import { ConfirmationModal } from "@/components/ConfirmationModal";

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
  return (
    <ConfirmationModal
      open={open}
      onClose={onClose}
      title="Publish changes"
      confirmLabel="Publish changes"
      confirmBusyLabel="Publishing…"
      busy={busy}
      onConfirm={onConfirm}
      confirmButtonClassName="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-emerald-500 disabled:opacity-50"
    >
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        This will re-scaffold team <code className="font-mono">{teamId}</code> from recipe <code className="font-mono">{recipeId}</code>.
      </p>
      <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        <div className="font-medium">Complete overwrite</div>
        <div className="mt-1">
          All existing team workspace files managed by the recipe will be overwritten (for example: <code className="font-mono">AGENTS.md</code>,{" "}
          <code className="font-mono">SOUL.md</code>, role templates, and other scaffolded files). Any manual edits in those files will be lost.
        </div>
      </div>
    </ConfirmationModal>
  );
}
