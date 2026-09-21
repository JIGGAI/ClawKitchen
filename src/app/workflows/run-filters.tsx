"use client";

import type { RunFacets, RunSort } from "@/lib/workflows/overview";

export type RunFilterState = { workflow: string; status: string; q: string; sort: RunSort };

const LABEL = "text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]";
const CONTROL =
  "mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]";

const SORT_LABELS: Record<RunSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  updated: "Recently updated",
};

function human(s: string): string {
  return s.replace(/_/g, " ");
}

/** Team / workflow / status / search / sort — everything the old Runs page filtered by, plus sort. */
export function RunFilters({
  team,
  teams,
  onTeam,
  facets,
  value,
  onChange,
}: {
  team: string;
  teams: { id: string; name: string }[];
  onTeam: (teamId: string) => void;
  facets: RunFacets;
  value: RunFilterState;
  onChange: (next: RunFilterState) => void;
}) {
  const set = (patch: Partial<RunFilterState>) => onChange({ ...value, ...patch });
  // Keep a filter that no longer has matches selectable, so it can be cleared.
  const workflows = value.workflow && !facets.workflows.some((w) => w.id === value.workflow)
    ? [...facets.workflows, { id: value.workflow, name: null, count: 0 }]
    : facets.workflows;
  const statuses = value.status && !facets.statuses.some((s) => s.status === value.status)
    ? [...facets.statuses, { status: value.status, count: 0 }]
    : facets.statuses;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <label className="block min-w-0">
        <div className={LABEL}>team</div>
        {/* Same selection as the sidebar switcher — changing one changes the other. */}
        <select value={team} onChange={(e) => onTeam(e.target.value)} className={CONTROL}>
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0">
        <div className={LABEL}>workflow</div>
        <select value={value.workflow} onChange={(e) => set({ workflow: e.target.value })} className={CONTROL}>
          <option value="">All workflows</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {(w.name ?? w.id) + ` (${w.count})`}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0">
        <div className={LABEL}>status</div>
        <select value={value.status} onChange={(e) => set({ status: e.target.value })} className={CONTROL}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s.status} value={s.status}>
              {`${human(s.status)} (${s.count})`}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0">
        <div className={LABEL}>search</div>
        <input
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="team / workflow / run id"
          className={CONTROL}
        />
      </label>

      <label className="block min-w-0">
        <div className={LABEL}>sort</div>
        <select value={value.sort} onChange={(e) => set({ sort: e.target.value as RunSort })} className={CONTROL}>
          {(Object.keys(SORT_LABELS) as RunSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
