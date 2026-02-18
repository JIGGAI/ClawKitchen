"use client";

import Link from "next/link";
import { errorMessage } from "@/lib/errors";
import { type GoalFrontmatter, type GoalStatus } from "@/lib/goals";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

  const tags = useMemo(
    () => tagsRaw.split(",").map((s) => s.trim()).filter(Boolean),
    [tagsRaw]
  );
  const teams = useMemo(
    () => teamsRaw.split(",").map((s) => s.trim()).filter(Boolean),
    [teamsRaw]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}`, { cache: "no-store" });
        const data = (await res.json()) as unknown;
        const obj = (data && typeof data === "object") ? (data as Record<string, unknown>) : {};
        if (cancelled) return;

        if (!res.ok) {
          setError(String(obj.error ?? "Failed to load goal"));
          setLoading(false);
          return;
        }

        const g = (obj.goal ?? {}) as GoalFrontmatter;
        setTitle(g.title ?? "");
        setStatus((g.status as GoalStatus) ?? "planned");
        setTagsRaw((g.tags ?? []).join(", "));
        setTeamsRaw((g.teams ?? []).join(", "));
        setBody(String(obj.body ?? ""));
        setUpdatedAt(g.updatedAt ?? null);
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = errorMessage(e);
        setError(msg);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [goalId]);

  async function reload() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}`, { cache: "no-store" });
    const data = (await res.json()) as unknown;
    const obj = (data && typeof data === "object") ? (data as Record<string, unknown>) : {};
    if (!res.ok) {
      setError(String(obj.error ?? "Failed to load goal"));
      setLoading(false);
      return;
    }
    const g = (obj.goal ?? {}) as GoalFrontmatter;
    setTitle(g.title ?? "");
    setStatus((g.status as GoalStatus) ?? "planned");
    setTagsRaw((g.tags ?? []).join(", "));
    setTeamsRaw((g.teams ?? []).join(", "));
    setBody(String(obj.body ?? ""));
    setUpdatedAt(g.updatedAt ?? null);
    setLoading(false);
  }

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

    await reload();
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
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Title</div>
          <input
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Goal title"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-[color:var(--ck-text-tertiary)]">Status</div>
            <select
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 text-sm"
              value={teamsRaw}
              onChange={(e) => setTeamsRaw(e.target.value)}
              placeholder="development-team, marketing-team"
            />
          </div>
          <div>
            <div className="text-xs text-[color:var(--ck-text-tertiary)]">Tags (comma-separated)</div>
            <input
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 text-sm"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="onboarding, growth"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-[color:var(--ck-text-tertiary)]">Body (markdown)</div>
            <div className="text-xs text-[color:var(--ck-text-tertiary)]">
              {updatedAt ? `updated ${new Date(updatedAt).toLocaleString()}` : ""}
            </div>
          </div>
          <textarea
            className="mt-1 h-[320px] w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the goal here…"
          />
        </div>

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
            onClick={() => void reload()}
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
