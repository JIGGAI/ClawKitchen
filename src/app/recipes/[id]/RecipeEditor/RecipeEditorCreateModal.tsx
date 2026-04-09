"use client";

import type { ReactNode } from "react";

type RecipeEditorCreateModalProps = {
  open: boolean;
  title: string;
  recipeId: string;
  children: ReactNode;
  error?: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
};

export function RecipeEditorCreateModal({
  open,
  title,
  recipeId,
  children,
  error,
  busy,
  onClose,
  onConfirm,
  confirmLabel,
}: RecipeEditorCreateModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="ck-card w-full max-w-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold tracking-tight">{title}</div>
            <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">From recipe: {recipeId}</div>
          </div>
          <button
            type="button"
            onClick={() => (!busy ? onClose() : undefined)}
            className="rounded-lg px-2 py-1 text-sm text-[color:var(--ck-text-secondary)] hover:text-[color:var(--ck-text-primary)]"
          >
            Close
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {children}
          {error ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">{error}</div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
            >
              {busy ? "Creating" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
