"use client";

import { ConfirmationModal } from "@/components/ConfirmationModal";

export function DeleteRecipeModal({
  open,
  recipeId,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  recipeId: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmationModal
      open={open}
      onClose={onClose}
      title="Delete recipe"
      confirmLabel="Delete"
      confirmBusyLabel="Deleting…"
      onConfirm={onConfirm}
      busy={busy}
      error={error}
    >
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Delete recipe <code className="font-mono">{recipeId}</code>? This removes the markdown file from your
        workspace.
      </p>
    </ConfirmationModal>
  );
}
