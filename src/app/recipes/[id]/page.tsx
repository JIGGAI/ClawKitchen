import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { listRecipesCached } from "@/lib/recipes";
import RecipeEditor from "./RecipeEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  noStore();

  const { id } = await params;

  // Warm the recipes-list cache so the client's /api/recipes/[id] fetch hits
  // a populated entry instead of paying the full subprocess cost again.
  // Result intentionally unused — we only care about the cache write.
  await listRecipesCached();

  // NOTE: We do NOT redirect team recipes to /teams/<id>.
  // /recipes/<id> is the recipe editor/preview surface; /teams/<id> is the installed team editor.

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
