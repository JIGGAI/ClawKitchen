"use client";

import Link from "next/link";
import { GoalFormCard, GoalFormFields } from "@/components/GoalFormFields";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import { type GoalFrontmatter, type GoalStatus, useGoalFormState } from "@/lib/goals-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function GoalEditor({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const { formState, tags, teams } = useGoalFormState();
  const { setTitle, setStatus, setTagsRaw, setTeamsRaw, setBody } = formState;

  const loadGoal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ goal: GoalFrontmatter; body: string }>(
        `/api/goals/${encodeURIComponent(goalId)}`,
        { cache: "no-store" }
      );
      const g = data.goal;
      setTitle(g.title ?? "");
      setStatus((g.status as GoalStatus) ?? "planned");
      setTagsRaw((g.tags ?? []).join(", "));
      setTeamsRaw((g.teams ?? []).join(", "));
      setBody(data.body ?? "");
      setUpdatedAt(g.updatedAt ?? null);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [goalId, setTitle, setStatus, setTagsRaw, setTeamsRaw, setBody]);

  useEffect(() => {
    void loadGoal();
  }, [loadGoal]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const data = await fetchJson<{ goal: GoalFrontmatter }>(
        `/api/goals/${encodeURIComponent(goalId)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: formState.title,
            status: formState.status,
            tags,
            teams,
            body: formState.body,
          }),
        }
      );
      setUpdatedAt(data.goal.updatedAt ?? null);
      router.push("/goals");
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function promoteToInbox() {
    setSaving(true);
    setError(null);
    try {
      await fetchJson(`/api/goals/${encodeURIComponent(goalId)}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      await loadGoal();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteThisGoal() {
    const ok = window.confirm(`Delete goal \"${goalId}\"? This will delete the markdown file.`);
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      await fetchJson(`/api/goals/${encodeURIComponent(goalId)}`, { method: "DELETE" });
      router.push("/goals");
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/goals" className="text-sm font-medium hover:underline">
          ← Back
        </Link>
        <div className="text-xs text-[color:var(--ck-text-tertiary)] font-mono">{goalId}</div>
      </div>

      <GoalFormCard
        error={error}
        actions={
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void save()}
            disabled={saving || loading}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => void loadGoal()}
            disabled={saving}
            className="rounded-lg border border-[color:var(--ck-border-subtle)] px-3 py-2 text-sm"
          >
            Reload
          </button>
          <button
            onClick={() => void promoteToInbox()}
            disabled={saving || loading}
            className="rounded-lg border border-[color:var(--ck-border-subtle)] px-3 py-2 text-sm font-medium"
          >
            Promote to inbox
          </button>
          <button
            onClick={() => void deleteThisGoal()}
            disabled={saving || loading}
            className="rounded-lg border border-[color:rgba(255,59,48,0.45)] bg-[color:rgba(255,59,48,0.08)] px-3 py-2 text-sm font-medium text-[color:var(--ck-accent-red)] transition-colors hover:bg-[color:rgba(255,59,48,0.12)]"
          >
            Delete
          </button>
        </div>
        }
      >
        <GoalFormFields formState={formState} updatedAt={updatedAt} />
      </GoalFormCard>

      <div className="ck-card p-6">
        <div className="text-sm font-medium">Preview</div>
        <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--ck-text-primary)]">{formState.body}</pre>
      </div>

      {loading ? <div className="text-sm text-[color:var(--ck-text-secondary)]">Loading…</div> : null}
    </div>
  );
}
