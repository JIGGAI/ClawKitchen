import Link from "next/link";

type Recipe = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

async function getRecipes(): Promise<Recipe[]> {
  const res = await fetch("/api/recipes", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load recipes");
  const json = (await res.json()) as { recipes: Recipe[] };
  return json.recipes;
}

export default async function RecipesPage() {
  const recipes = await getRecipes();

  const builtin = recipes.filter((r) => r.source === "builtin");
  const workspace = recipes.filter((r) => r.source === "workspace");

  const Section = ({ title, items }: { title: string; items: Recipe[] }) => (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((r) => (
          <li key={`${r.source}:${r.id}`} className="flex items-center justify-between rounded border p-3">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-slate-600">
                {r.id} • {r.kind} • {r.source}
              </div>
            </div>
            <Link className="text-sm underline" href={`/recipes/${r.id}`}>
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <main className="p-8 max-w-4xl">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>

      <Section title={`Builtin (${builtin.length})`} items={builtin} />
      <Section title={`Workspace (${workspace.length})`} items={workspace} />

      <p className="mt-10 text-xs text-slate-500">
        Note: editing builtin recipes will modify the recipes plugin install path on this machine.
      </p>
    </main>
  );
}
