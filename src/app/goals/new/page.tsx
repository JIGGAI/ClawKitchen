"use client";

import Link from "next/link";
import { GoalFormFields } from "@/components/GoalFormFields";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type GoalStatus, parseCommaList } from "@/lib/goals";
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

  const tags = useMemo(() => parseCommaList(tagsRaw), [tagsRaw]);
  const teams = useMemo(() => parseCommaList(teamsRaw), [teamsRaw]);

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
          idField={{ id, setId, suggestedId: suggestedId || undefined }}
          bodyHeight="h-[260px]"
        />

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
