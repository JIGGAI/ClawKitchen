"use client";

import Link from "next/link";
import { GoalFormCard, GoalFormFields } from "@/components/GoalFormFields";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { slugifyId } from "@/lib/slugify";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import { useGoalFormState } from "@/lib/goals-client";

export default function NewGoalPage() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const defaultBody =
    "## Workflow\n<!-- goal-workflow -->\n- Use **Promote to inbox** to send this goal to the development-team inbox for scoping.\n- When promoted, set goal status to **active**.\n- Track implementation work via tickets (add links/IDs under a **Tickets** section in this goal).\n- When development is complete (all associated tickets marked done), set goal status to **done**.\n\n## Tickets\n- (add ticket links/ids)\n";
  const { formState, tags, teams } = useGoalFormState({ body: defaultBody });
  const { title } = formState;

  const suggestedId = useMemo(() => {
    const s = slugifyId(title, 64);
    return s.length >= 2 ? s : "";
  }, [title]);

  async function create() {
    setSaving(true);
    setError(null);
    const finalId = id.trim();
    try {
      await fetchJson("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: finalId,
          title: formState.title,
          status: formState.status,
          tags,
          teams,
          body: formState.body,
        }),
      });
      router.push(`/goals/${encodeURIComponent(finalId)}`);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/goals" className="text-sm font-medium hover:underline">
        ← Back
      </Link>

      <GoalFormCard
        error={error}
        actions={
          <button
            onClick={() => void create()}
            disabled={saving}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create"}
          </button>
        }
      >
        <h1 className="text-xl font-semibold tracking-tight">Create goal</h1>
        <GoalFormFields
          formState={formState}
          idField={{ id, setId, suggestedId: suggestedId || undefined }}
          bodyHeight="h-[260px]"
        />
      </GoalFormCard>
    </div>
  );
}
