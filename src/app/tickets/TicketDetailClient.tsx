"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useToast } from "@/components/ToastProvider";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import { parseTicketComments } from "@/lib/ticket-comments";
import { TicketAssignControl } from "@/app/tickets/[ticket]/TicketAssignControl";

export function isPostCommentDisabled(commentBody: string, isPending: boolean) {
  return isPending || commentBody.trim().length == 0;
}

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

  const comments = useMemo(() => parseTicketComments(props.markdown), [props.markdown]);

  const [commentAuthor, setCommentAuthor] = useState<string>("");
  const [commentBody, setCommentBody] = useState<string>("");

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

  async function submitComment() {
    setError(null);
    const body = commentBody.trim();
    if (!body) throw new Error("Comment cannot be empty.");

    await fetchJson(`/api/teams/${encodeURIComponent(props.teamId)}/tickets/comment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticket: props.ticketId,
        author: commentAuthor.trim() || undefined,
        comment: body,
      }),
    });

    setCommentBody("");
    toast.push({ kind: "success", message: "Comment added." });
    router.refresh();
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
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">Comments</div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">{comments.length}</div>
        </div>

        {comments.length ? (
          <div className="mt-3 space-y-3">
            {comments.map((c, idx) => (
              <div
                key={`${c.timestamp}-${idx}`}
                className="rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-black/10 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-xs font-medium text-[color:var(--ck-text-primary)]">{c.author}</div>
                  <div className="text-xs text-[color:var(--ck-text-tertiary)]">{c.timestamp}</div>
                </div>
                <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--ck-text-secondary)]">
                  {c.body}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">No comments yet.</div>
        )}

        <div className="mt-4 border-t border-[color:var(--ck-border-subtle)] pt-4">
          <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">Add comment</div>

          <div className="mt-3 grid gap-3">
            <div className="grid gap-1">
              <label className="text-xs font-medium text-[color:var(--ck-text-secondary)]" htmlFor="ck-comment-author">
                Author (optional)
              </label>
              <input
                id="ck-comment-author"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                placeholder="unknown"
                className="w-full rounded border border-[color:var(--ck-border-subtle)] bg-black/20 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] outline-none focus:border-[color:var(--ck-border-strong)]"
                disabled={isPending}
              />
            </div>

            <div className="grid gap-1">
              <label className="text-xs font-medium text-[color:var(--ck-text-secondary)]" htmlFor="ck-comment-body">
                Comment
              </label>
              <textarea
                id="ck-comment-body"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={4}
                className="w-full rounded border border-[color:var(--ck-border-subtle)] bg-black/20 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] outline-none focus:border-[color:var(--ck-border-strong)]"
                disabled={isPending}
              />
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                aria-busy={isPending}
                className={
                  "rounded-[var(--ck-radius-sm)] bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-[var(--ck-shadow-1)] transition " +
                  "hover:bg-emerald-500 active:bg-emerald-700 " +
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ck-border-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-black/30 " +
                  "disabled:cursor-not-allowed disabled:opacity-50"
                }
                onClick={() => {
                  startTransition(() => {
                    submitComment().catch((e: unknown) => setError(errorMessage(e)));
                  });
                }}
                disabled={isPostCommentDisabled(commentBody, isPending)}
              >
                {isPending ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
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
                <>
                  This will move the ticket out of the work lanes into <code>work/goals/</code> so it won’t be picked up by
                  automation.
                </>
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
