"use client";

import type { GoalStatus } from "@/lib/goals";

const inputClass =
  "mt-1 w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 text-sm";

type Props = {
  title: string;
  setTitle: (v: string) => void;
  status: GoalStatus;
  setStatus: (v: GoalStatus) => void;
  tagsRaw: string;
  setTagsRaw: (v: string) => void;
  teamsRaw: string;
  setTeamsRaw: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  /** When provided, renders the ID field (for create flow). */
  idField?: { id: string; setId: (v: string) => void; suggestedId?: string };
  /** When provided, shows updated timestamp next to body label. */
  updatedAt?: string | null;
  /** Body textarea height override (e.g. 260 for new page). */
  bodyHeight?: string;
};

export function GoalFormFields({
  title,
  setTitle,
  status,
  setStatus,
  tagsRaw,
  setTagsRaw,
  teamsRaw,
  setTeamsRaw,
  body,
  setBody,
  idField,
  updatedAt,
  bodyHeight = "h-[320px]",
}: Props) {
  return (
    <>
      {idField ? (
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">ID</div>
          <input
            className={`${inputClass} font-mono`}
            value={idField.id}
            onChange={(e) => idField.setId(e.target.value)}
            placeholder="increase-trial-activation"
          />
          <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
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
        <div className="text-xs text-[color:var(--ck-text-tertiary)]">Title</div>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={idField ? "Increase trial activation" : "Goal title"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Status</div>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as GoalStatus)}
          >
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Teams (comma-separated)</div>
          <input
            className={inputClass}
            value={teamsRaw}
            onChange={(e) => setTeamsRaw(e.target.value)}
            placeholder="development-team, marketing-team"
          />
        </div>
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Tags (comma-separated)</div>
          <input
            className={inputClass}
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="onboarding, growth"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Body (markdown)</div>
          {updatedAt != null ? (
            <div className="text-xs text-[color:var(--ck-text-tertiary)]">
              {updatedAt ? `updated ${new Date(updatedAt).toLocaleString()}` : ""}
            </div>
          ) : null}
        </div>
        <textarea
          className={`mt-1 ${bodyHeight} w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the goal here…"
        />
      </div>
    </>
  );
}
