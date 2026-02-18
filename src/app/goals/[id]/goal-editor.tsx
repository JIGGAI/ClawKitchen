"use client";

import Link from "next/link";
import { GoalFormFields } from "@/components/GoalFormFields";
import { errorMessage } from "@/lib/errors";
import { type GoalFrontmatter, type GoalStatus, parseCommaList } from "@/lib/goals";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

function parseGoalResponse(res: Response, data: unknown): { error?: string; goal?: GoalFrontmatter; body?: string } {
  const obj = (data && typeof data === "object") ? (data as Record<string, unknown>) : {};
  if (!res.ok) return { error: String(obj.error ?? "Failed to load goal") };

  const g = (obj.goal ?? {}) as GoalFrontmatter;
  return {
    goal: g,
    body: String(obj.body ?? ""),
  };
}

export default function GoalEditor({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<GoalStatus>("planned");
  const [tagsRaw, setTagsRaw] = useState("");
  const [teamsRaw, setTeamsRaw] = useState("");
  const [body, setBody] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const tags = useMemo(() => parseCommaList(tagsRaw), [tagsRaw]);
  const teams = useMemo(() => parseCommaList(teamsRaw), [teamsRaw]);

  const loadGoal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}`, { cache: "no-store" });
      const data = (await res.json()) as unknown;
      const parsed = parseGoalResponse(res, data);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      const g = parsed.goal as GoalFrontmatter;
      setTitle(g.title ?? "");
      setStatus((g.status as GoalStatus) ?? "planned");
      setTagsRaw((g.tags ?? []).join(", "));
      setTeamsRaw((g.teams ?? []).join(", "));
      setBody(parsed.body ?? "");
      setUpdatedAt(g.updatedAt ?? null);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    void loadGoal();
  }, [loadGoal]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, status, tags, teams, body }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? "Failed to save");
      setSaving(false);
      return;
    }
    const g = data.goal as GoalFrontmatter;
    setUpdatedAt(g.updatedAt ?? null);
    setSaving(false);

    // Save should behave like an editor "submit": return to the list.
    router.push("/goals");
  }

  async function promoteToInbox() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}/promote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? "Failed to promote");
      setSaving(false);
      return;
    }

    await loadGoal();
    setSaving(false);
  }

  async function deleteThisGoal() {
    const ok = window.confirm(`Delete goal \"${goalId}\"? This will delete the markdown file.`);
    if (!ok) return;

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? "Failed to delete");
      setSaving(false);
      return;
    }

    router.push("/goals");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/goals" className="text-sm font-medium hover:underline">
          ← Back
        </Link>
        <div className="text-xs text-[color:var(--ck-text-tertiary)] font-mono">{goalId}</div>
      </div>

      <div className="ck-glass p-6 space-y-4">
        <GoalFormFields
          title={title}
          setTitle={setTitle}
          status={status}
          setStatus={setStatus}
          tagsRaw={tagsRaw}
          setTagsRaw={setTagsRaw}
          teamsRaw={teamsRaw}
          setTeamsRaw={setTeamsRaw}
          body={body}
          setBody={setBody}
          updatedAt={updatedAt}
        />

        {error ? <div className="text-sm text-red-300">{error}</div> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void save()}
            disabled={saving || loading}
            className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => void loadGoal()}
            disabled={saving}
            className="rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] px-3 py-2 text-sm"
          >
            Reload
          </button>
          <button
            onClick={() => void promoteToInbox()}
            disabled={saving || loading}
            className="rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] px-3 py-2 text-sm font-medium"
          >
            Promote to inbox
          </button>
          <button
            onClick={() => void deleteThisGoal()}
            disabled={saving || loading}
            className="rounded-[var(--ck-radius-sm)] border border-red-500/40 px-3 py-2 text-sm font-medium text-red-200"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="ck-glass p-6">
        <div className="text-sm font-medium">Preview</div>
        <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--ck-text-primary)]">{body}</pre>
      </div>

      {loading ? <div className="text-sm text-[color:var(--ck-text-secondary)]">Loading…</div> : null}
    </div>
  );
}
