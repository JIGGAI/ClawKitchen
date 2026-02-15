import Link from "next/link";
import { runOpenClaw } from "@/lib/openclaw";
import RecipesClient from "./recipes-client";

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

export default async function RecipesPage() {
  const { recipes, error } = await getRecipes();

  const builtin = recipes.filter((r) => r.source === "builtin");
  const workspace = recipes.filter((r) => r.source === "workspace");

  // Workspace recipes are user-editable markdown files under ~/.openclaw/workspace/recipes.
  // Treat them as "Custom recipes" in the UI.
  const customTeamRecipes = workspace.filter((r) => r.kind === "team");
  const customAgentRecipes = workspace.filter((r) => r.kind === "agent");

  return (
    <div className="ck-glass mx-auto max-w-4xl p-6 sm:p-8">
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
        <div className="mt-6 rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-[color:var(--ck-bg-glass)] p-4 text-sm text-[color:var(--ck-text-secondary)]">
          <div className="font-medium text-[color:var(--ck-text-primary)]">Recipes unavailable</div>
          <div className="mt-1 whitespace-pre-wrap">{error}</div>
          <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
            If this says &quot;unknown command &apos;recipes&apos;&quot;, the Recipes plugin is likely disabled/not allowlisted.
            Try: <code className="ml-1">openclaw plugins enable recipes</code> then restart the gateway.
          </div>
        </div>
      ) : null}

      <RecipesClient builtin={builtin} customTeamRecipes={customTeamRecipes} customAgentRecipes={customAgentRecipes} />

      <p className="mt-10 text-xs text-[color:var(--ck-text-tertiary)]">
        Note: editing builtin recipes will modify the recipes plugin install path on this machine.
      </p>
    </div>
  );
}
