"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { errorMessage } from "@/lib/errors";
import type { RecipeListItem } from "@/lib/recipes";
import { DeleteRecipeModal } from "./DeleteRecipeModal";

function RecipesSection({
  title,
  items,
  onDelete,
  installedAgentIds,
}: {
  title: string;
  items: RecipeListItem[];
  onDelete?: (id: string) => void;
  installedAgentIds: string[];
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ck-text-primary)]">{title}</h2>

      {items.length === 0 ? (
        <div className="mt-3 ck-glass px-4 py-3 text-sm text-[color:var(--ck-text-secondary)]">None yet.</div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((r) => {
            const isInstalledAgent = r.kind === "agent" && installedAgentIds.includes(r.id);
            const editHref = isInstalledAgent
              ? `/agents/${encodeURIComponent(r.id)}`
              : `/recipes/${encodeURIComponent(r.id)}`;
            const editLabel = isInstalledAgent ? "Edit agent" : "Edit recipe";

            return (
              <div
                key={`${r.source}:${r.id}`}
                className="ck-glass flex items-start justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-[color:var(--ck-text-primary)]">{r.name}</div>
                  <div className="mt-1 truncate text-xs text-[color:var(--ck-text-secondary)]">
                    <span className="font-mono">{r.id}</span> • {r.kind} • {r.source}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    className="rounded-[var(--ck-radius-sm)] px-3 py-1.5 text-sm font-medium text-[color:var(--ck-accent-red)] transition-colors hover:text-[color:var(--ck-accent-red-hover)]"
                    href={editHref}
                  >
                    {editLabel}
                  </Link>
                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function RecipesClient({
  builtin,
  customTeamRecipes,
  customAgentRecipes,
  installedAgentIds,
}: {
  builtin: RecipeListItem[];
  customTeamRecipes: RecipeListItem[];
  customAgentRecipes: RecipeListItem[];
  installedAgentIds: string[];
}) {
  const toast = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const onDelete = (id: string) => {
    setDeleteId(id);
    setModalError(null);
    setDeleteOpen(true);
  };

  async function confirmDelete() {
    setBusy(true);
    setModalError(null);
    try {
      const res = await fetch("/api/recipes/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg = String(json.error || "Delete failed");
        if (res.status === 409) {
          setModalError(msg);
          return;
        }
        throw new Error(msg);
      }
      toast.push({ kind: "success", message: `Deleted recipe: ${deleteId}` });
      setDeleteOpen(false);
      window.location.reload();
    } catch (e: unknown) {
      toast.push({ kind: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-8 space-y-10">
        <section>
          <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ck-text-primary)]">Custom recipes</h2>
          <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            Workspace recipes (editable) — stored under <code className="font-mono">~/.openclaw/workspace/recipes/</code>.
          </p>

          <div className="mt-4 space-y-8">
            <RecipesSection
              title={`Teams (${customTeamRecipes.length})`}
              items={customTeamRecipes}
              onDelete={onDelete}
              installedAgentIds={installedAgentIds}
            />
            <RecipesSection
              title={`Agents (${customAgentRecipes.length})`}
              items={customAgentRecipes}
              onDelete={onDelete}
              installedAgentIds={installedAgentIds}
            />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ck-text-primary)]">Builtin recipes</h2>
          <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">Bundled recipes shipped with the plugin.</p>

          <div className="mt-4">
            <RecipesSection
              title={`All (${builtin.length})`}
              items={builtin}
              installedAgentIds={installedAgentIds}
            />
          </div>
        </section>
      </div>

      <DeleteRecipeModal
        open={deleteOpen}
        recipeId={deleteId}
        busy={busy}
        error={modalError}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
