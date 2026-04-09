"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import type { GoalFormState, GoalStatus } from "@/lib/goals-client";

export type { GoalFormState };

/** Wraps goal form content with error display and action buttons. */
export function GoalFormCard({
  children,
  error,
  actions,
}: {
  children: ReactNode;
  error: string | null;
  actions: ReactNode;
}) {
  return (
    <div className="ck-card p-6 space-y-4">
      {children}
      {error ? <div className="text-sm text-red-300">{error}</div> : null}
      {actions}
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 text-sm";

type Props = {
  formState: GoalFormState;
  /** When provided, renders the ID field (for create flow). */
  idField?: { id: string; setId: (v: string) => void; suggestedId?: string };
  /** When provided, shows updated timestamp next to body label. */
  updatedAt?: string | null;
  /** Body textarea height override (e.g. 260 for new page). */
  bodyHeight?: string;
};

export function GoalFormFields({
  formState,
  idField,
  updatedAt,
  bodyHeight = "h-[320px]",
}: Props) {
  const { title, setTitle, status, setStatus, tagsRaw, setTagsRaw, teamsRaw, setTeamsRaw, body, setBody } = formState;
  const baseId = useId();
  const idInputId = `${baseId}-id`;
  const titleInputId = `${baseId}-title`;
  const statusSelectId = `${baseId}-status`;
  const teamsInputId = `${baseId}-teams`;
  const tagsInputId = `${baseId}-tags`;
  const bodyTextareaId = `${baseId}-body`;
  return (
    <>
      {idField ? (
        <div>
          <label htmlFor={idInputId} className="text-xs text-[color:var(--ck-text-tertiary)]">
            ID
          </label>
          <input
            id={idInputId}
            className={`${inputClass} font-mono`}
            value={idField.id}
            onChange={(e) => idField.setId(e.target.value)}
            placeholder="increase-trial-activation"
            aria-describedby={`${baseId}-id-hint`}
          />
          <div id={`${baseId}-id-hint`} className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
            Lowercase letters, numbers, hyphens. Stored as <code className="font-mono">{idField.id || "<id>"}.md</code>
            .
            {idField.suggestedId && !idField.id.trim() ? (
              <>
                {" "}
                Suggested:{" "}
                <button type="button" className="underline" onClick={() => idField.setId(idField.suggestedId ?? "")}>
                  {idField.suggestedId}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <label htmlFor={titleInputId} className="text-xs text-[color:var(--ck-text-tertiary)]">
          Title
        </label>
        <input
          id={titleInputId}
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={idField ? "Increase trial activation" : "Goal title"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={statusSelectId} className="text-xs text-[color:var(--ck-text-tertiary)]">
            Status
          </label>
          <select
            id={statusSelectId}
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as GoalStatus)}
            aria-label="Goal status"
          >
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div>
          <label htmlFor={teamsInputId} className="text-xs text-[color:var(--ck-text-tertiary)]">
            Teams (comma-separated)
          </label>
          <input
            id={teamsInputId}
            className={inputClass}
            value={teamsRaw}
            onChange={(e) => setTeamsRaw(e.target.value)}
            placeholder="development-team, marketing-team"
          />
        </div>
        <div>
          <label htmlFor={tagsInputId} className="text-xs text-[color:var(--ck-text-tertiary)]">
            Tags (comma-separated)
          </label>
          <input
            id={tagsInputId}
            className={inputClass}
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="onboarding, growth"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor={bodyTextareaId} className="text-xs text-[color:var(--ck-text-tertiary)]">
            Body (markdown)
          </label>
          {updatedAt != null ? (
            <div className="text-xs text-[color:var(--ck-text-tertiary)]">
              {updatedAt ? `updated ${new Date(updatedAt).toLocaleString()}` : ""}
            </div>
          ) : null}
        </div>
        <textarea
          id={bodyTextareaId}
          className={`mt-1 ${bodyHeight} w-full rounded-lg border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the goal here…"
        />
      </div>
    </>
  );
}
