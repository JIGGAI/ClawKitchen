import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { runOpenClaw } from "@/lib/openclaw";
import { readManifest, isManifestStale, triggerManifestRegeneration } from "@/lib/manifest";
import RecipesClient from "./recipes-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Recipe = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

async function getRecipes(): Promise<{ recipes: Recipe[]; error: string | null }> {
  const res = await runOpenClaw(["recipes", "list"]);
  if (!res.ok) {
    const err = res.stderr.trim() || `openclaw recipes list failed (exit=${res.exitCode})`;
    return { recipes: [], error: err };
  }

  try {
    return { recipes: JSON.parse(res.stdout) as Recipe[], error: null };
  } catch {
    return { recipes: [], error: "Failed to parse openclaw recipes list output" };
  }
}

async function getAgents(): Promise<{ agentIds: string[]; error: string | null }> {
  const res = await runOpenClaw(["agents", "list", "--json"]);
  if (!res.ok) {
    const err = res.stderr.trim() || `openclaw agents list failed (exit=${res.exitCode})`;
    return { agentIds: [], error: err };
  }
  try {
    const items = JSON.parse(res.stdout) as Array<{ id?: unknown }>;
    const agentIds = Array.isArray(items) ? items.map((a) => String(a.id ?? "")).filter(Boolean) : [];
    return { agentIds, error: null };
  } catch {
    return { agentIds: [], error: "Failed to parse openclaw agents list output" };
  }
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();

  const sp = (await Promise.resolve(searchParams)) ?? {};

  // Fast path: read from manifest (single file read vs 2 subprocess calls ~10-15s)
  const manifest = await readManifest();
  let recipes: Recipe[] = [];
  let agentIds: string[] = [];
  let error: string | null = null;

  if (manifest?.recipes?.length) {
    if (isManifestStale(manifest)) triggerManifestRegeneration();
    recipes = manifest.recipes as Recipe[];
    agentIds = manifest.agents?.map((a) => a.id).filter(Boolean) ?? [];
  } else {
    // Fallback: subprocess calls
    const [recipesResult, agentsResult] = await Promise.all([getRecipes(), getAgents()]);
    recipes = recipesResult.recipes;
    error = recipesResult.error;
    agentIds = agentsResult.agentIds;
  }

  const builtin = recipes.filter((r) => r.source === "builtin");
  const workspace = recipes.filter((r) => r.source === "workspace");

  // Workspace recipes are user-editable markdown files under ~/.openclaw/workspace/recipes.
  // Treat them as "Custom recipes" in the UI.
  const customTeamRecipes = workspace.filter((r) => r.kind === "team");
  const customAgentRecipes = workspace.filter((r) => r.kind === "agent");

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
        <Link
          href="/"
          className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
        >
          Home
        </Link>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-[color:var(--ck-border-subtle)] bg-white/5 p-4 text-sm text-[color:var(--ck-text-secondary)]">
          <div className="font-medium text-[color:var(--ck-text-primary)]">Recipes unavailable</div>
          <div className="mt-1 whitespace-pre-wrap">{error}</div>
          <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
            If this says &quot;unknown command &apos;recipes&apos;&quot;, the Recipes plugin is likely disabled/not allowlisted.
            Try: <code className="ml-1">openclaw plugins enable recipes</code> then restart the gateway.
          </div>
        </div>
      ) : null}

      <RecipesClient
        builtin={builtin}
        customTeamRecipes={customTeamRecipes}
        customAgentRecipes={customAgentRecipes}
        installedAgentIds={agentIds}
        initialOpenCustomTeam={
          String(sp.createCustomTeam ?? "") === "1" || String(sp.createCustomTeam ?? "") === "true"
        }
      />

      <p className="mt-10 text-xs text-[color:var(--ck-text-tertiary)]">
        Note: editing builtin recipes will modify the recipes plugin install path on this machine.
      </p>
    </div>
  );
}
