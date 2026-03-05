import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { getTeamDisplayName } from "@/lib/recipes";
import { readWorkflowRun } from "@/lib/workflows/runs-storage";
import { readWorkflow } from "@/lib/workflows/storage";
import RunDetailClient from "./run-detail-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TeamRunDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; workflowId: string; runId: string }>;
}) {
  noStore();

  const { teamId, workflowId, runId } = await params;
  const name = await getTeamDisplayName(teamId);

  const [{ run }, workflowRes] = await Promise.all([
    readWorkflowRun(teamId, workflowId, runId),
    readWorkflow(teamId, workflowId).catch(() => null),
  ]);

  const wfName = workflowRes?.workflow?.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">
            <Link href={`/runs?team=${encodeURIComponent(teamId)}`} className="hover:underline">
              Runs
            </Link>
            <span className="mx-2">/</span>
            <span className="font-mono">{workflowId}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {wfName ? `${wfName} · ` : ""}
            <span className="font-mono">{runId}</span>
          </h1>
          <div className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            {name || teamId} · <span className="font-mono">{teamId}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/teams/${encodeURIComponent(teamId)}/workflows/${encodeURIComponent(workflowId)}`}
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] hover:underline"
          >
            Workflow editor →
          </Link>
        </div>
      </div>

      <RunDetailClient run={run} />
    </div>
  );
}
