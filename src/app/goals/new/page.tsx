"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type GoalStatus } from "@/lib/goals";
import { slugifyId } from "@/lib/slugify";

export default function NewGoalPage() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<GoalStatus>("planned");
  const [tagsRaw, setTagsRaw] = useState("");
  const [teamsRaw, setTeamsRaw] = useState("");
  const [body, setBody] = useState(
    "## Workflow\n<!-- goal-workflow -->\n- Use **Promote to inbox** to send this goal to the development-team inbox for scoping.\n- When promoted, set goal status to **active**.\n- Track implementation work via tickets (add links/IDs under a **Tickets** section in this goal).\n- When development is complete (all associated tickets marked done), set goal status to **done**.\n\n## Tickets\n- (add ticket links/ids)\n"
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tags = useMemo(() => tagsRaw.split(",").map((s) => s.trim()).filter(Boolean), [tagsRaw]);
  const teams = useMemo(() => teamsRaw.split(",").map((s) => s.trim()).filter(Boolean), [teamsRaw]);

  const suggestedId = useMemo(() => {
    const s = slugifyId(title, 64);
    return s.length >= 2 ? s : "";
  }, [title]);

  async function create() {
    setSaving(true);
    setError(null);

    const finalId = id.trim();

    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: finalId, title, status, tags, teams, body }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? "Failed to create goal");
      setSaving(false);
      return;
    }

    router.push(`/goals/${encodeURIComponent(finalId)}`);
  }

  return (
    <div className="space-y-4">
      <Link href="/goals" className="text-sm font-medium hover:underline">
        ← Back
      </Link>

      <div className="ck-glass p-6 space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Create goal</h1>

        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">ID</div>
          <input
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 text-sm font-mono"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="increase-trial-activation"
          />
          <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
            Lowercase letters, numbers, hyphens. Stored as <code className="font-mono">{id || "<id>"}.md</code>.
            {suggestedId && !id.trim() ? (
              <>
                {" "}Suggested:{" "}
                <button className="underline" onClick={() => setId(suggestedId)}>
                  {suggestedId}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Title</div>
          <input
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Increase trial activation"
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
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Body (markdown)</div>
          <textarea
            className="mt-1 h-[260px] w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the goal here…"
          />
        </div>

        {error ? <div className="text-sm text-red-300">{error}</div> : null}

        <button
          onClick={() => void create()}
          disabled={saving}
          className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}
