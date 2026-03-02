"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/ToastProvider";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import { TicketAssignControl } from "@/app/tickets/[ticket]/TicketAssignControl";

export function TicketDetailClient(props: {
  teamId: string;
  ticketId: string;
  file: string;
  markdown: string;
  backHref?: string;
  currentOwner?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "goals" | "delete" }>(null);

  async function moveToGoals() {
    setError(null);
    await fetchJson(`/api/teams/${encodeURIComponent(props.teamId)}/tickets/move-to-goals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: props.ticketId }),
    });
  }

  async function deleteTicket() {
    setError(null);
    await fetchJson(`/api/teams/${encodeURIComponent(props.teamId)}/tickets/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: props.ticketId }),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={props.backHref ?? "/tickets"} className="text-sm font-medium hover:underline">
          ← Back
        </Link>
        <span className="text-xs text-[color:var(--ck-text-tertiary)]">{props.file}</span>
      </div>

      {error ? (
        <div className="ck-glass border border-[color:var(--ck-border-strong)] p-3 text-sm text-[color:var(--ck-text-primary)]">
          {error}
        </div>
      ) : null}

      {props.currentOwner !== undefined ? (
        <TicketAssignControl teamId={props.teamId} ticket={props.ticketId} currentOwner={props.currentOwner ?? null} />
      ) : null}

      <div className="ck-glass p-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className="rounded border border-[color:var(--ck-border-subtle)] px-3 py-1.5 text-xs font-medium text-[color:var(--ck-text-secondary)] hover:border-[color:var(--ck-border-strong)]"
            onClick={() => setConfirm({ kind: "goals" })}
            disabled={isPending}
          >
            Move to Goals
          </button>
          <button
            className="rounded border border-[color:var(--ck-accent-red)] bg-[color:var(--ck-accent-red-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--ck-accent-red)] hover:bg-[color:var(--ck-accent-red-soft-strong)]"
            onClick={() => setConfirm({ kind: "delete" })}
            disabled={isPending}
          >
            Delete Ticket
          </button>
        </div>
      </div>

      <div className="ck-glass p-6">
        <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--ck-text-primary)]">
          {props.markdown}
        </pre>
      </div>

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="ck-glass w-full max-w-lg rounded-[var(--ck-radius-md)] border border-[color:var(--ck-border-strong)] p-4">
            <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">
              {confirm.kind === "goals" ? "Move to Goals" : "Delete ticket"}
            </div>

            <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
              {confirm.kind === "goals" ? (
                <>This will move the ticket out of the work lanes into <code>work/goals/</code> so it won’t be picked up by automation.</>
              ) : (
                <>This will permanently remove the ticket markdown file. Assignment stubs (if any) will be archived.</>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="rounded border border-[color:var(--ck-border-subtle)] px-3 py-1.5 text-xs text-[color:var(--ck-text-secondary)]"
                onClick={() => setConfirm(null)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                className={
                  confirm.kind === "delete"
                    ? "rounded bg-[color:var(--ck-accent-red)] px-3 py-1.5 text-xs font-medium text-white"
                    : "rounded bg-[color:var(--ck-accent)] px-3 py-1.5 text-xs font-medium text-black"
                }
                onClick={() => {
                  const kind = confirm.kind;
                  setConfirm(null);
                  startTransition(() => {
                    const op = kind === "goals" ? moveToGoals() : deleteTicket();
                    op
                      .then(() => {
                        toast.push({
                          kind: "success",
                          message: kind === "delete" ? "Ticket deleted." : "Moved to Goals.",
                        });
                        if (kind === "delete") {
                          router.push(props.backHref ?? "/tickets");
                        } else {
                          router.refresh();
                        }
                      })
                      .catch((e: unknown) => setError(errorMessage(e)));
                  });
                }}
                disabled={isPending}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
