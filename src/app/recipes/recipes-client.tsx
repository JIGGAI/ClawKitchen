"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { DeleteRecipeModal } from "./DeleteRecipeModal";

type Recipe = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

function RecipesSection({ title, items, onDelete }: { title: string; items: Recipe[]; onDelete?: (id: string) => void }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ck-text-primary)]">{title}</h2>
      <ul className="mt-3 space-y-3">
        {items.map((r) => (
          <li key={`${r.source}:${r.id}`} className="ck-glass flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{r.name}</div>
              <div className="mt-0.5 text-xs text-[color:var(--ck-text-secondary)]">
                {r.id} • {r.kind} • {r.source}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                className="shrink-0 rounded-[var(--ck-radius-sm)] px-3 py-1.5 text-sm font-medium text-[color:var(--ck-accent-red)] transition-colors hover:text-[color:var(--ck-accent-red-hover)]"
                href={`/recipes/${r.id}`}
              >
                Edit
              </Link>
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  className="shrink-0 rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function RecipesClient({ builtin, customTeamRecipes, customAgentRecipes }: { builtin: Recipe[]; customTeamRecipes: Recipe[]; customAgentRecipes: Recipe[] }) {
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
      // simplest refresh
      window.location.reload();
    } catch (e: unknown) {
      toast.push({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecipesSection title={`Builtin (${builtin.length})`} items={builtin} />
      <RecipesSection title={`Custom recipes — Teams (${customTeamRecipes.length})`} items={customTeamRecipes} onDelete={onDelete} />
      <RecipesSection title={`Custom recipes — Agents (${customAgentRecipes.length})`} items={customAgentRecipes} onDelete={onDelete} />

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
