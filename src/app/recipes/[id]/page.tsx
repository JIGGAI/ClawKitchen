import Link from "next/link";
import { redirect } from "next/navigation";
import { findRecipeById } from "@/lib/recipes";
import RecipeEditor from "./RecipeEditor";

async function getKind(id: string): Promise<"agent" | "team" | null> {
  const item = await findRecipeById(id);
  return item?.kind ?? null;
}

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kind = await getKind(id);

  // Team recipes should use the Team editor UI.
  if (kind === "team") {
    // Team recipes map directly to /teams/<teamId> (no extra "-team" suffix).
    redirect(`/teams/${encodeURIComponent(id)}`);
  }

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
