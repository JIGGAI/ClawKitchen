import Link from "next/link";
import RecipeEditor from "./RecipeEditor";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <div className="px-8 pt-6">
        <Link href="/recipes" className="text-sm underline">
          ← Back to recipes
        </Link>
      </div>
      <RecipeEditor recipeId={id} />
    </main>
  );
}
