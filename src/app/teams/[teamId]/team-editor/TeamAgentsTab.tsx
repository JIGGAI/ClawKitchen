"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import AgentEditor from "@/app/agents/[agentId]/agent-editor";
import type { TeamAgentEntry } from "./types";

type RecipeAgent = { role: string; name?: string };

type TeamAgentsTabProps = {
  teamId: string;
  toId: string;
  recipeAgents: RecipeAgent[];
  newRole: string;
  setNewRole: (v: string) => void;
  customRole: string;
  setCustomRole: (v: string) => void;
  newRoleName: string;
  setNewRoleName: (v: string) => void;
  derivedRole: string;
  saving: boolean;
  teamAgents: TeamAgentEntry[];
  teamAgentsLoading: boolean;
  onAddAgent: () => Promise<void>;
};

export function TeamAgentsTab(props: TeamAgentsTabProps) {
  const [editAgentId, setEditAgentId] = useState<string | null>(null);
  const {
    toId,
    recipeAgents,
    newRole,
    setNewRole,
    customRole,
    setCustomRole,
    newRoleName,
    setNewRoleName,
    derivedRole,
    saving,
    teamAgents,
    teamAgentsLoading,
    onAddAgent,
  } = props;

  return (
    <div className="mt-6 ck-card p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Agents in this team</div>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Add/remove agents by updating the <code>agents:</code> list in your custom team recipe (<code>{toId}</code>).
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Role</label>
          <select
            value={newRole}
            onChange={(e) => {
              const v = e.target.value;
              setNewRole(v);
              if (v === "__custom__") {
                setCustomRole("");
                setNewRoleName("");
                return;
              }
              setCustomRole("");
              const match = recipeAgents.find((a) => a.role === v);
              setNewRoleName(match?.name || "");
            }}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          >
            <option value="">Select…</option>
            {recipeAgents.map((a) => (
              <option key={a.role} value={a.role}>
                {a.name || a.role}
              </option>
            ))}
            <option value="__custom__">Other…</option>
          </select>

          {newRole === "__custom__" ? (
            <input
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="role (e.g. researcher)"
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />
          ) : null}

          <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
            This writes to the recipe&apos;s <code>agents:</code> list.
          </div>
        </div>

        <div className="sm:col-span-2">
          <div>
            <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Name (optional)</label>
            <input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Onchain Researcher"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={saving || !derivedRole}
          onClick={onAddAgent}
          className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
        >
          Add agent
        </button>
      </div>

      <div className="mt-6">
        <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Detected installed team agents (read-only)</div>
        <ul className="mt-2 space-y-2">
          {teamAgents.length ? (
            teamAgents.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[color:var(--ck-text-primary)]">
                    {a.identityName || a.id}
                  </div>
                  <div className="text-xs text-[color:var(--ck-text-secondary)]">{a.id}</div>
                </div>
                <button
                  type="button"
                  className="text-sm font-medium text-[var(--ck-accent-red)] hover:text-[color:var(--ck-accent-red-hover)]"
                  onClick={() => setEditAgentId(a.id)}
                >
                  Edit
                </button>
              </li>
            ))
          ) : null}
          {teamAgents.length === 0 && !teamAgentsLoading && (
            <li className="text-sm text-[color:var(--ck-text-secondary)]">No team agents detected.</li>
          )}
          {teamAgents.length === 0 && teamAgentsLoading && (
            <li className="text-sm text-[color:var(--ck-text-secondary)]">Loading…</li>
          )}
        </ul>
      </div>

      <Modal
        open={!!editAgentId}
        onClose={() => setEditAgentId(null)}
        title={editAgentId ?? "Agent"}
        size="full"
        hideTitle
      >
        {editAgentId ? (
          <AgentEditor
            agentId={editAgentId}
            onClose={() => setEditAgentId(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
