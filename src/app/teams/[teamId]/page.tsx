import Link from "next/link";
import { findRecipeById } from "@/lib/recipes";
import TeamEditor from "./team-editor";

async function getTeamDisplayName(teamId: string) {
  const item = await findRecipeById(teamId);
  return item?.kind === "team" ? (item.name ?? null) : null;
}

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const name = await getTeamDisplayName(teamId);

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto mb-4 flex max-w-6xl items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/"
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
          >
            ← Home
          </Link>
          <Link
            href="/recipes"
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
          >
            ← Recipes
          </Link>
        </div>

        <div className="text-right">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">{name || teamId}</div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">{teamId}</div>
        </div>
      </div>

      <div className="mx-auto mb-4 flex max-w-6xl items-center justify-end">
        <Link
          href={`/goals?team=${encodeURIComponent(teamId)}`}
          className="text-sm font-medium text-[color:var(--ck-text-secondary)] hover:underline"
        >
          View goals for this team →
        </Link>
      </div>

      <TeamEditor teamId={teamId} />
    </main>
  );
}
