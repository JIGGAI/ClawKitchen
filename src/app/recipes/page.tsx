import Link from "next/link";
import { runOpenClaw } from "@/lib/openclaw";

type Recipe = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

async function getRecipes(): Promise<Recipe[]> {
  const { stdout } = await runOpenClaw(["recipes", "list"]);
  return JSON.parse(stdout) as Recipe[];
}

function RecipesSection({ title, items }: { title: string; items: Recipe[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ck-text-primary)]">
        {title}
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((r) => (
          <li
            key={`${r.source}:${r.id}`}
            className="ck-glass flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{r.name}</div>
              <div className="mt-0.5 text-xs text-[color:var(--ck-text-secondary)]">
                {r.id} • {r.kind} • {r.source}
              </div>
            </div>
            <Link
              className="shrink-0 rounded-[var(--ck-radius-sm)] px-3 py-1.5 text-sm font-medium text-[color:var(--ck-accent-red)] transition-colors hover:text-[color:var(--ck-accent-red-hover)]"
              href={`/recipes/${r.id}`}
            >
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function RecipesPage() {
  const recipes = await getRecipes();

  const builtin = recipes.filter((r) => r.source === "builtin");
  const workspace = recipes.filter((r) => r.source === "workspace");

  const customTeams = workspace.filter((r) => r.kind === "team" && r.id.startsWith("custom-"));
  const workspaceOther = workspace.filter((r) => !(r.kind === "team" && r.id.startsWith("custom-")));

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

      <RecipesSection title={`Builtin (${builtin.length})`} items={builtin} />
      <RecipesSection title={`Custom team recipes (${customTeams.length})`} items={customTeams} />
      <RecipesSection title={`Workspace (${workspaceOther.length})`} items={workspaceOther} />

      <p className="mt-10 text-xs text-[color:var(--ck-text-tertiary)]">
        Note: editing builtin recipes will modify the recipes plugin install path on this machine.
      </p>
    </div>
  );
}
