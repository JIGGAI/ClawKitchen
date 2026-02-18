"use client";

import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { type RecipeDetail } from "@/lib/recipes";

export default function RecipeEditor({ recipeId }: { recipeId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [content, setContent] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [scaffoldOut, setScaffoldOut] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMessage("");
      const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "Failed to load recipe");
        setLoading(false);
        return;
      }
      const r = json.recipe as RecipeDetail;
      setRecipe(r);
      setContent(r.content);
      setLoading(false);
    })();
  }, [recipeId]);

  const canSave = useMemo(() => {
    if (!recipe) return false;
    return recipe.filePath !== null;
  }, [recipe]);

  async function onSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setMessage(`Saved to ${json.filePath}`);
    } catch (e: unknown) {
      const msg = errorMessage(e);
      setMessage(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onScaffold() {
    if (!recipe) return;
    setScaffoldOut("");
    setMessage("");
    try {
      const res = await fetch("/api/scaffold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: recipe.kind,
          recipeId: recipe.id,
          applyConfig: false,
          overwrite: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Scaffold failed");
      setScaffoldOut([json.stdout, json.stderr].filter(Boolean).join("\n"));
    } catch (e: unknown) {
      const msg = errorMessage(e);
      setScaffoldOut(msg);
    }
  }

  if (loading) return <div className="ck-glass mx-auto max-w-4xl p-6">Loading…</div>;
  if (!recipe) return <div className="ck-glass mx-auto max-w-4xl p-6">Not found.</div>;

  return (
    <div className="ck-glass mx-auto max-w-6xl p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{recipe.name}</h1>
          <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">
            {recipe.id} • {recipe.kind} • {recipe.source}
          </div>
          <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
            Path: {recipe.filePath ?? "(unknown / not writable)"}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onScaffold}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
          >
            Scaffold
          </button>
          <button
            disabled={!canSave || saving}
            onClick={onSave}
            className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--ck-text-primary)]">
          {message}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe markdown</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-2 h-[70vh] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 font-mono text-xs text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
            spellCheck={false}
          />
        </div>
        <div className="ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Scaffold output</div>
          <pre className="mt-2 h-[70vh] w-full overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 text-xs text-[color:var(--ck-text-primary)]">
            {scaffoldOut || "(no output yet)"}
          </pre>
        </div>
      </div>

      <p className="mt-6 text-xs text-[color:var(--ck-text-tertiary)]">
        Phase 1: Scaffold button runs <code>openclaw recipes scaffold</code> or <code>scaffold-team</code>.
        We’ll add apply-config/overwrite toggles and a dry-run/plan view next.
      </p>
    </div>
  );
}
