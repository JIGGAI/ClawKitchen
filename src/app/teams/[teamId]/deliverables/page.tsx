import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import DeliverablesClient from "./deliverables-client";
import { getTeamDisplayName } from "@/lib/recipes";
import { readWorkflow } from "@/lib/workflows/storage";
import type { WorkflowDeliverablesResponse } from "@/app/api/teams/workflow-deliverables/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TeamDeliverablesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  noStore();

  const { teamId } = await params;
  const teamName = await getTeamDisplayName(teamId);

  // Fetch deliverables from our API
  const baseUrl = process.env.KITCHEN_INTERNAL_URL || "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/teams/workflow-deliverables?teamId=${encodeURIComponent(teamId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deliverables</h1>
          <div className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            {teamName || teamId} · <span className="font-mono">{teamId}</span>
          </div>
        </div>
        
        <div className="rounded-[var(--ck-radius-lg)] border border-red-400/30 bg-red-500/10 p-4">
          <div className="text-red-50">Failed to load deliverables</div>
          <div className="mt-1 text-sm text-red-200">
            Error: {response.status} {response.statusText}
          </div>
        </div>
      </div>
    );
  }

  const data = await response.json() as WorkflowDeliverablesResponse;
  
  if (!data.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deliverables</h1>
          <div className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            {teamName || teamId} · <span className="font-mono">{teamId}</span>
          </div>
        </div>
        
        <div className="rounded-[var(--ck-radius-lg)] border border-red-400/30 bg-red-500/10 p-4">
          <div className="text-red-50">Failed to load deliverables</div>
          <div className="mt-1 text-sm text-red-200">
            {(data as { error?: string }).error || "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  // Load workflow metadata for better display
  const wfIds = Array.from(new Set(data.deliverables.map((d) => d.workflowId).filter(Boolean))).sort();
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
          <h1 className="text-2xl font-semibold tracking-tight">Deliverables</h1>
          <div className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            {teamName || teamId} · <span className="font-mono">{teamId}</span>
          </div>
          <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
            Browse and access outputs from completed workflow runs
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/teams/${encodeURIComponent(teamId)}/workflows`}
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] hover:underline"
          >
            Workflows →
          </Link>
          <Link
            href={`/runs?team=${encodeURIComponent(teamId)}`}
            className="text-sm font-medium text-[color:var(--ck-text-secondary)] hover:underline"
          >
            Runs →
          </Link>
        </div>
      </div>

      <DeliverablesClient 
        teamId={teamId} 
        deliverables={data.deliverables} 
        workflows={workflows}
      />
    </div>
  );
}