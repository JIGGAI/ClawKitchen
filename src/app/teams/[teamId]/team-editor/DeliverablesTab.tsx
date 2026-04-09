"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import DeliverablesClient from "../deliverables/deliverables-client";
import type { WorkflowDeliverablesResponse } from "@/app/api/teams/workflow-deliverables/route";

export function DeliverablesTab({ teamId }: { teamId: string }) {
  const [deliverables, setDeliverables] = useState<WorkflowDeliverablesResponse["deliverables"]>([]);
  const [workflows, setWorkflows] = useState<Record<string, { id: string; name?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function loadDeliverables() {
      if (!teamId) return;
      
      setLoading(true);
      setError("");
      
      try {
        // Fetch deliverables
        const response = await fetchJson<WorkflowDeliverablesResponse>(
          `/api/teams/workflow-deliverables?teamId=${encodeURIComponent(teamId)}`
        );
        
        if (!mounted) return;
        
        if (!response.ok) {
          setError((response as { error?: string }).error || "Failed to load deliverables");
          return;
        }
        
        setDeliverables(response.deliverables);
        
        // Load workflow metadata for better display
        const wfIds = Array.from(new Set(response.deliverables.map((d) => d.workflowId).filter(Boolean))).sort();
        const workflowsData: Record<string, { id: string; name?: string }> = {};
        
        await Promise.all(
          wfIds.map(async (id) => {
            try {
              const wfResponse = await fetchJson<{ ok?: boolean; workflow?: { id: string; name?: string } }>(
                `/api/teams/workflows?teamId=${encodeURIComponent(teamId)}&workflowId=${encodeURIComponent(id)}`
              );
              if (wfResponse.ok && wfResponse.workflow) {
                workflowsData[id] = { id: wfResponse.workflow.id, name: wfResponse.workflow.name };
              } else {
                workflowsData[id] = { id };
              }
            } catch {
              workflowsData[id] = { id };
            }
          })
        );
        
        if (mounted) {
          setWorkflows(workflowsData);
        }
        
      } catch (e: unknown) {
        if (mounted) {
          setError(errorMessage(e));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDeliverables();
    
    return () => {
      mounted = false;
    };
  }, [teamId]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/10 p-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-[color:var(--ck-text-secondary)]">Loading deliverables...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6">
        <div className="text-red-50">Failed to load deliverables</div>
        <div className="mt-2 text-sm text-red-200">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[color:var(--ck-text-primary)]">
          Workflow Deliverables
        </h2>
        <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
          Browse and access outputs from completed workflow runs.
        </p>
      </div>
      
      <DeliverablesClient 
        teamId={teamId} 
        deliverables={deliverables} 
        workflows={workflows}
      />
    </div>
  );
}