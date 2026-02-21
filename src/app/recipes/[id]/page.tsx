import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { runOpenClaw } from "@/lib/openclaw";
import RecipeEditor from "./RecipeEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RecipeListItem = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

async function getKind(id: string): Promise<"agent" | "team" | null> {
  const res = await runOpenClaw(["recipes", "list"]);
  if (!res.ok) return null;
  try {
    const items = JSON.parse(res.stdout) as RecipeListItem[];
    return items.find((r) => r.id === id)?.kind ?? null;
  } catch {
    return null;
  }
}

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  noStore();

  const { id } = await params;
  const kind = await getKind(id);

  // NOTE: We do NOT redirect team recipes to /teams/<id>.
  // /recipes/<id> is the recipe editor/preview surface; /teams/<id> is the installed team editor.
  void kind;

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto mb-4 max-w-6xl">
        <Link
          href="/recipes"
          className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
        >
          ← Back to recipes
        </Link>
      </div>
      <RecipeEditor recipeId={id} />
    </main>
  );
}
