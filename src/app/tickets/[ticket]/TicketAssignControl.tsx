"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export function TicketAssignControl({
  teamId,
  ticket,
  currentOwner,
}: {
  teamId?: string | null;
  ticket: string;
  currentOwner: string | null;
}) {
  const router = useRouter();
  const [assignees, setAssignees] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(currentOwner ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = teamId
          ? `/api/teams/${encodeURIComponent(teamId)}/tickets/assignees`
          : "/api/tickets/assignees";
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as { assignees?: string[] };
        if (cancelled) return;
        setAssignees(Array.isArray(json.assignees) ? json.assignees : []);
      } catch {
        if (cancelled) return;
        setAssignees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const base = new Set(assignees);
    if (currentOwner) base.add(currentOwner);
    return Array.from(base).sort();
  }, [assignees, currentOwner]);

  async function onAssign() {
    setLoading(true);
    setError(null);
    try {
      const url = teamId
        ? `/api/teams/${encodeURIComponent(teamId)}/tickets/assign`
        : "/api/tickets/assign";

      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket, assignee: selected, ...(teamId ? { teamId } : {}) }),
      });

      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Assign failed");
        return;
      }

      router.refresh();
    } catch {
      setError("Assign failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ck-glass p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs font-medium text-[color:var(--ck-text-tertiary)]">Assignee</div>
        <select
          className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="" disabled>
            Select…
          </option>
          {options.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onAssign}
          disabled={loading || !selected || selected === (currentOwner ?? "")}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Assigning…" : "Assign"}
        </button>

        {currentOwner ? (
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Currently: {currentOwner}</div>
        ) : null}
      </div>

      {error ? <div className="mt-2 text-xs text-red-300">{error}</div> : null}
    </div>
  );
}
