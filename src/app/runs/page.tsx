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
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
        <div className="text-sm text-[color:var(--ck-text-secondary)]">
          Select a team from the left sidebar to view workflow runs.
        </div>
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
