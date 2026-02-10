"use client";

import { useEffect, useMemo, useState } from "react";

type Recipe = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
  content: string;
  filePath: string | null;
};

export default function RecipeEditor({ recipeId }: { recipeId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
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
      const r = json.recipe as Recipe;
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
    } catch (e: any) {
      setMessage(e?.message ?? String(e));
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
    } catch (e: any) {
      setScaffoldOut(e?.message ?? String(e));
    }
  }

  if (loading) return <div className="p-8">Loading…</div>;
  if (!recipe) return <div className="p-8">Not found.</div>;

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{recipe.name}</h1>
          <div className="mt-1 text-xs text-slate-600">
            {recipe.id} • {recipe.kind} • {recipe.source}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Path: {recipe.filePath ?? "(unknown / not writable)"}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onScaffold}
            className="rounded border px-3 py-2 text-sm"
          >
            Scaffold
          </button>
          <button
            disabled={!canSave || saving}
            onClick={onSave}
            className="rounded bg-black text-white px-3 py-2 text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded border bg-white p-3 text-sm">{message}</div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-medium">Recipe markdown</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-2 h-[70vh] w-full rounded border p-3 font-mono text-xs"
            spellCheck={false}
          />
        </div>
        <div>
          <div className="text-sm font-medium">Scaffold output</div>
          <pre className="mt-2 h-[70vh] w-full overflow-auto rounded border p-3 text-xs bg-slate-50">
            {scaffoldOut || "(no output yet)"}
          </pre>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Phase 1: Scaffold button runs <code>openclaw recipes scaffold</code> or <code>scaffold-team</code>.
        We’ll add apply-config/overwrite toggles and a dry-run/plan view next.
      </p>
    </div>
  );
}
