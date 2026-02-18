"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { RecipeListItem } from "@/lib/recipes";
import { slugifyId } from "@/lib/slugify";

function getIdInputClass(state: "empty" | "available" | "taken"): string {
  const base = "mt-1 w-full rounded-[var(--ck-radius-sm)] border bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] ";
  if (state === "available") return base + "border-emerald-400/50";
  if (state === "taken") return base + "border-red-400/60";
  return base + "border-white/10";
}

export function CloneTeamModal({
  open,
  onClose,
  recipes,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  recipes: RecipeListItem[];
  onConfirm: (args: { id: string; name: string; scaffold: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [scaffold, setScaffold] = useState(true);

  const derivedId = useMemo(() => slugifyId(name, 80), [name]);
  const effectiveId = idTouched ? id : derivedId;

  const availability = useMemo(() => {
    const v = effectiveId.trim();
    if (!v) return { state: "empty" as const, exists: false };
    const exists = recipes.some((r) => r.id === v);
    return { state: exists ? ("taken" as const) : ("available" as const), exists };
  }, [effectiveId, recipes]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[color:var(--ck-bg-glass-strong)] p-5 shadow-[var(--ck-shadow-2)]">
            <div className="text-lg font-semibold text-[color:var(--ck-text-primary)]">Clone Team</div>
            <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
              Enter a new team name and id. The id will be used as the new custom recipe id.
            </p>

            <label className="mt-4 block text-xs font-medium text-[color:var(--ck-text-secondary)]">New team name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />

            <label className="mt-4 block text-xs font-medium text-[color:var(--ck-text-secondary)]">New team id</label>
            <input
              value={effectiveId}
              onChange={(e) => {
                setIdTouched(true);
                setId(e.target.value);
              }}
              className={getIdInputClass(availability.state)}
            />
            <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
              {availability.state === "taken" && "That id is already taken."}
              {availability.state === "available" && "Id is available."}
            </div>

            {availability.state === "taken" ? (
              <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Try one of these ids</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[`custom-${effectiveId.trim()}`, `my-${effectiveId.trim()}`, `${effectiveId.trim()}-2`, `${effectiveId.trim()}-alt`]
                    .filter((x) => x && x !== effectiveId.trim())
                    .map((x) => (
                      <button
                        key={x}
                        type="button"
                        onClick={() => {
                          setIdTouched(true);
                          setId(x);
                        }}
                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                      >
                        {x}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            <label className="mt-5 flex items-start gap-2 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--ck-text-secondary)]">
              <input
                type="checkbox"
                checked={scaffold}
                onChange={(e) => setScaffold(e.target.checked)}
                className="mt-1"
              />
              <span>
                Also scaffold workspace files (recommended).<br />
                <span className="text-xs text-[color:var(--ck-text-tertiary)]">
                  Creates the team workspace + standard file tree immediately so the cloned team is usable.
                </span>
              </span>
            </label>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!name.trim() || !effectiveId.trim() || availability.state === "taken"}
                onClick={() => onConfirm({ id: effectiveId.trim(), name: name.trim(), scaffold })}
                className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
              >
                Clone
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  , document.body
  );
}
