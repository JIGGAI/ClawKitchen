"use client";

import { ConfirmationModal } from "@/components/ConfirmationModal";

export function DeleteTeamModal({
  open,
  teamId,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  teamId: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmationModal
      open={open}
      onClose={onClose}
      title="Delete Team"
      confirmLabel="Delete"
      confirmBusyLabel="Deleting…"
      onConfirm={onConfirm}
      busy={busy}
    >
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Delete team <code className="font-mono">{teamId}</code>? This will remove the team workspace, agents, and
        stamped cron jobs.
      </p>
    </ConfirmationModal>
  );
}
