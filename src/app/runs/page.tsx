import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import RunsClient from "@/app/teams/[teamId]/runs/runs-client";
import { getTeamDisplayName } from "@/lib/recipes";
import { listAllWorkflowRuns } from "@/lib/workflows/runs-storage";
import { readWorkflow } from "@/lib/workflows/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Runs are live + file-backed; never serve cached HTML.
  noStore();

  const sp = await searchParams;
  const team = Array.isArray(sp.team) ? sp.team[0] : sp.team;
  const teamId = String(team ?? "").trim();

  if (!teamId) {
    const { listLocalTeamIds } = await import("@/lib/teams");
    const AllRunsClient = (await import("@/app/runs/AllRunsClient")).default;

    const teamIds = await listLocalTeamIds();

    const rowsNested = await Promise.all(
      teamIds.map(async (tId) => {
        const teamName = await getTeamDisplayName(tId);
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

  const name = await getTeamDisplayName(teamId);
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
