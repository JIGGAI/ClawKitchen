import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import RunsClient from "@/app/teams/[teamId]/runs/runs-client";
import { listAllWorkflowRuns } from "@/lib/workflows/runs-storage";
import { readWorkflow } from "@/lib/workflows/storage";
import { readManifest } from "@/lib/manifest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();

  const sp = await searchParams;
  const team = Array.isArray(sp.team) ? sp.team[0] : sp.team;
  const teamId = String(team ?? "").trim();

  // Pre-load manifest for fast team name lookups (avoids ~8s subprocess per call)
  const manifest = await readManifest();
  const getTeamName = (tId: string): string | null => {
    const entry = manifest?.teams?.[tId];
    if (entry?.displayName) return entry.displayName;
    const recipe = manifest?.recipes?.find((r) => r.kind === "team" && r.id === tId);
    if (recipe?.name) return recipe.name;
    // Return null rather than falling back to slow subprocess — the teamId
    // is shown alongside the name anyway, so null is acceptable.
    return null;
  };

  if (!teamId) {
    const { listLocalTeamIds } = await import("@/lib/teams");
    const AllRunsClient = (await import("@/app/runs/AllRunsClient")).default;

    // Use manifest for team list if available (avoids filesystem scan)
    const teamIds = manifest ? Object.keys(manifest.teams).sort() : await listLocalTeamIds();

    const rowsNested = await Promise.all(
      teamIds.map(async (tId) => {
        const teamName = getTeamName(tId);
        const { runs } = await listAllWorkflowRuns(tId);
        return runs.map((r) => ({
          teamId: tId,
          teamName,
          workflowId: r.workflowId,
          runId: r.runId,
          status: r.status,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          updatedAt: r.updatedAt,
        }));
      })
    );

    const rows = rowsNested.flat().sort((a, b) => String(b.updatedAt || b.endedAt || b.startedAt || "").localeCompare(String(a.updatedAt || a.endedAt || a.startedAt || "")));

    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
          <div className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            Showing workflow runs across all local teams. Use the team dropdown to filter.
          </div>
        </div>

        <AllRunsClient rows={rows} />
      </div>
    );
  }

  const name = getTeamName(teamId);
  const { runs } = await listAllWorkflowRuns(teamId);

  const wfIds = Array.from(new Set(runs.map((r) => r.workflowId).filter(Boolean))).sort();
  const workflows: Record<string, { id: string; name?: string }> = {};
  await Promise.all(
    wfIds.map(async (id) => {
      try {
        const { workflow } = await readWorkflow(teamId, id);
        workflows[id] = { id: workflow.id, name: workflow.name };
      } catch {
        workflows[id] = { id };
      }
    })
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
          <div className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            {name || teamId} · <span className="font-mono">{teamId}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/teams/${encodeURIComponent(teamId)}/workflows`}
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] hover:underline"
          >
            Workflows →
          </Link>
        </div>
      </div>

      <RunsClient teamId={teamId} initialRuns={runs} workflows={workflows} />
    </div>
  );
}
