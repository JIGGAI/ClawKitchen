"use client";

import type { RecipeListItem } from "./types";

type TeamRecipeTabProps = {
  loading?: boolean;
  fromId: string;
  setFromId: (v: string) => void;
  toId: string;
  setToId: (v: string) => void;
  toName: string;
  setToName: (v: string) => void;
  canEditTargetId: boolean;
  teamRecipes: RecipeListItem[];
  lockedFromId: string | null;
  lockedFromName: string | null;
  provenanceMissing: boolean;
  saving: boolean;
  teamIdValid: boolean;
  targetIdValid: boolean;
  targetIsBuiltin: boolean;
  loadedRecipeHash: string | null;
  teamMetaRecipeHash: string | null;
  publishing: boolean;
  content: string;
  setContent: (v: string) => void;
  setLoadedRecipeHash: (v: string | null) => void;
  recipeLoadError: string;
  onSaveCustom: (overwrite: boolean) => void;
  onPublishOpen: () => void;
  onDeleteOpen: () => void;
};

export function TeamRecipeTab(props: TeamRecipeTabProps) {
  const p = props;
  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ck-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Custom recipe target</div>
            {p.loading ? (
              <div className="text-xs text-[color:var(--ck-text-tertiary)]">Loading team…</div>
            ) : null}
          </div>
          <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Team id</label>
          <input
            value={p.toId}
            onChange={(e) => p.setToId(e.target.value)}
            disabled={!p.canEditTargetId}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] disabled:opacity-70"
          />
          <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
            This is the custom recipe id that will be created when you save.
          </div>
          <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Team name</label>
          <input
            value={p.toName}
            onChange={(e) => p.setToName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
          <div className="mt-4 grid grid-cols-1 gap-2">
            <button
              type="button"
              disabled={p.saving || !p.teamIdValid || !p.targetIdValid || p.targetIsBuiltin}
              onClick={() => p.onSaveCustom(true)}
              className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
            >
              {p.saving ? "Saving" : "Save"}
            </button>
            <button
              type="button"
              disabled={
                p.saving ||
                !p.teamIdValid ||
                !p.targetIdValid ||
                p.targetIsBuiltin ||
                !p.loadedRecipeHash ||
                !p.teamMetaRecipeHash ||
                p.loadedRecipeHash === p.teamMetaRecipeHash
              }
              onClick={p.onPublishOpen}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
            >
              {p.publishing ? "Publishing" : "Publish changes"}
            </button>
            <button
              type="button"
              disabled={p.saving}
              onClick={p.onDeleteOpen}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] disabled:opacity-50"
            >
              Delete Team
            </button>
          </div>
        </div>
        <div className="ck-card p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Notes</div>
          <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Parent recipe (locked)</div>
            <select
              disabled
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] disabled:opacity-70"
              value={p.fromId}
              onChange={(e) => p.setFromId(e.target.value)}
            >
              {p.teamRecipes.map((r) => (
                <option key={`${r.source}:${r.id}`} value={r.id}>
                  {r.id} ({r.source})
                </option>
              ))}
            </select>
            {p.lockedFromId && (
              <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                <code>{p.lockedFromId}</code>
                {p.lockedFromName ? ` (${p.lockedFromName})` : ""}
              </div>
            )}
            {!p.lockedFromId && p.provenanceMissing && (
              <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                Provenance not found for this team.
              </div>
            )}
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
            <li>Save writes the custom recipe file identified by Team id.</li>
            <li>Publish changes re-scaffolds this team from your custom recipe.</li>
            <li>Delete Team runs openclaw recipes remove-team.</li>
          </ul>
        </div>
      </div>
      <div className="mt-6 ck-card p-4">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe markdown</div>
        {p.recipeLoadError ? (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {p.recipeLoadError}
          </div>
        ) : null}
        <textarea
          value={p.content}
          onChange={(e) => {
            p.setContent(e.target.value);
            p.setLoadedRecipeHash(null);
          }}
          className="mt-2 h-[55vh] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
          spellCheck={false}
        />
      </div>
    </>
  );
}
