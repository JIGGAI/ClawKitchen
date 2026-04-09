"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import { validateCreateId } from "@/lib/recipe-team-agents";
import { fetchScaffold } from "@/lib/scaffold-client";
import type { AgentRecipeFrontmatter, Recipe, TeamRecipeFrontmatter } from "./types";
import { parseFrontmatter } from "./recipe-editor-utils";
import { TeamRecipePanelContent, AgentRecipePanelContent } from "./RecipeEditorPanel";
import { RecipeEditorCreateModal } from "./RecipeEditorCreateModal";

type CreateModalKind = "team" | "agent" | null;

export default function RecipeEditor({ recipeId }: { recipeId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [content, setContent] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const [createModalKind, setCreateModalKind] = useState<CreateModalKind>(null);
  const [createId, setCreateId] = useState("");
  const [createName, setCreateName] = useState("");
  const [cronInstallChoice, setCronInstallChoice] = useState<"yes" | "no">("no");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMessage("");
      try {
        const json = await fetchJson<{ recipe: Recipe }>(
          `/api/recipes/${encodeURIComponent(recipeId)}`,
          { cache: "no-store" }
        );
        const r = json.recipe;
        setRecipe(r);
        setContent(r.content);
      } catch (e: unknown) {
        setMessage(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [recipeId]);

  const canSave = useMemo(() => {
    if (!recipe) return false;
    return recipe.filePath !== null;
  }, [recipe]);

  const teamFrontmatter = useMemo(() => {
    if (!recipe || recipe.kind !== "team") return { fm: null as TeamRecipeFrontmatter | null, error: undefined as string | undefined };
    return parseFrontmatter(content);
  }, [recipe, content]);

  const agentFrontmatter = useMemo(() => {
    if (!recipe || recipe.kind !== "agent") return { fm: null as AgentRecipeFrontmatter | null, error: undefined as string | undefined };
    return parseFrontmatter(content);
  }, [recipe, content]);

  async function onSave() {
    setSaving(true);
    setMessage("");
    try {
      const json = await fetchJson<{ filePath: string }>(
        `/api/recipes/${encodeURIComponent(recipeId)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );
      setMessage(`Saved to ${json.filePath}`);
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function openCreateTeam() {
    setCreateError("");
    setCreateId("");
    setCronInstallChoice("no");
    setCreateModalKind("team");
  }

  function openCreateAgent() {
    setCreateError("");
    setCreateId("");
    setCreateName((agentFrontmatter.fm?.name || recipe?.name || "").trim());
    setCreateModalKind("agent");
  }

  async function onSubmitCreate() {
    if (!recipe || !createModalKind) return;
    const kind = createModalKind;
    const err = validateCreateId(recipe, createId, kind);
    if (err) {
      setCreateError(err);
      return;
    }

    const id = createId.trim();
    setCreateBusy(true);
    setCreateError("");

    try {
      if (kind === "team") {
        const { res, json } = await fetchScaffold({
          kind: "team",
          recipeId: recipe.id,
          teamId: id,
          cronInstallChoice,
        });
        if (!res.ok) throw new Error((json as { error?: string }).error || "Create Team failed");
        setCreateModalKind(null);
        router.push(`/teams/${encodeURIComponent(id)}`);
      } else {
        const { res, json } = await fetchScaffold({
          kind: "agent",
          recipeId: recipe.id,
          agentId: id,
          name: createName.trim() || undefined,
        });
        if (!res.ok) throw new Error((json as { error?: string }).error || "Create Agent failed");
        setCreateModalKind(null);
        router.push(`/agents/${encodeURIComponent(id)}`);
      }
      router.refresh();
    } catch (e: unknown) {
      setCreateError(errorMessage(e));
    } finally {
      setCreateBusy(false);
    }
  }

  if (loading) return <div className="ck-card mx-auto max-w-4xl p-6">Loading</div>;
  if (!recipe) return <div className="ck-card mx-auto max-w-4xl p-6">Not found.</div>;

  const fm = recipe.kind === "team" ? teamFrontmatter.fm : null;
  const fmErr = recipe.kind === "team" ? teamFrontmatter.error : undefined;

  const afm = recipe.kind === "agent" ? agentFrontmatter.fm : null;
  const afmErr = recipe.kind === "agent" ? agentFrontmatter.error : undefined;

  return (
    <div className="ck-card mx-auto max-w-6xl p-6 sm:p-8">
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
            disabled={!canSave || saving}
            onClick={onSave}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
          >
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--ck-text-primary)]">
          {message}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ck-card p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe markdown</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-2 h-[70vh] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-xs text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
            spellCheck={false}
          />
        </div>

        {recipe.kind === "team" ? (
          <TeamRecipePanelContent recipe={recipe} fm={fm as TeamRecipeFrontmatter | null} fmErr={fmErr} onOpenCreateTeam={openCreateTeam} />
        ) : (
          <AgentRecipePanelContent recipe={recipe} afm={afm as AgentRecipeFrontmatter | null} afmErr={afmErr} onOpenCreateAgent={openCreateAgent} />
        )}
      </div>

      <RecipeEditorCreateModal
        open={createModalKind !== null}
        title={createModalKind === "team" ? "Create Team" : "Create Agent"}
        recipeId={recipe.id}
        busy={createBusy}
        error={createError || undefined}
        onClose={() => setCreateModalKind(null)}
        onConfirm={onSubmitCreate}
        confirmLabel={createModalKind === "team" ? "Create Team" : "Create Agent"}
      >
        {createModalKind === "team" ? (
          <>
            <label className="block">
              <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Team id</div>
              <input
                value={createId}
                onChange={(e) => setCreateId(e.target.value)}
                placeholder="e.g. acme"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                disabled={createBusy}
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Install cron jobs</div>
              <select
                value={cronInstallChoice}
                onChange={(e) => setCronInstallChoice(e.target.value as "yes" | "no")}
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                disabled={createBusy}
              >
                <option value="no">No (recommended)</option>
                <option value="yes">Yes</option>
              </select>
              <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
                Kitchen scaffolds non-interactively; this controls the one-time cron install choice for this run.
              </div>
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Agent id</div>
              <input
                value={createId}
                onChange={(e) => setCreateId(e.target.value)}
                placeholder="e.g. larry"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                disabled={createBusy}
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Name (optional)</div>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Larry"
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                disabled={createBusy}
              />
            </label>
          </>
        )}
      </RecipeEditorCreateModal>

      <p className="mt-6 text-xs text-[color:var(--ck-text-tertiary)]">
        This page edits the recipe markdown and previews what will be created when you click{" "}
        {recipe.kind === "team" ? "Create Team" : "Create Agent"}.
      </p>
    </div>
  );
}
