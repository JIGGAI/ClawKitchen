import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { runOpenClaw } from "@/lib/openclaw";
import TeamEditor from "./team-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RecipeListItem = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

async function getTeamDisplayName(teamId: string) {
  const res = await runOpenClaw(["recipes", "list"]);
  if (!res.ok) return null;
  try {
    const items = JSON.parse(res.stdout) as RecipeListItem[];
    const match = items.find((r) => r.kind === "team" && r.id === teamId);
    return match?.name ?? null;
  } catch {
    return null;
  }
}

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  // Team pages depend on live OpenClaw state; never serve cached HTML.
  noStore();

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
