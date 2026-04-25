import { cachedRunOpenClaw } from "./openclaw-cache";

export type AgentListItem = {
  id: string;
  identityName?: string;
  workspace?: string;
  model?: string;
  isDefault?: boolean;
};

// `openclaw agents list --json` is a subprocess that takes ~15s on this
// machine and is called from many read-only paths (orchestrator route, recipe
// editor, scaffold, ids check). Uses the default cache TTL (5 min); agent
// mutation routes (create/delete via openclaw CLI) call
// invalidateOpenClawCache(["agents", "list"]) after success.
export async function listAgentsCached(): Promise<AgentListItem[]> {
  const res = await cachedRunOpenClaw(["agents", "list", "--json"]);
  if (!res.ok) return [];
  try {
    return JSON.parse(res.stdout) as AgentListItem[];
  } catch {
    return [];
  }
}

export async function resolveAgentWorkspace(agentId: string): Promise<string> {
  const list = await listAgentsCached();
  const agent = list.find((a) => a.id === agentId);
  if (!agent?.workspace) throw new Error(`Agent workspace not found for ${agentId}`);
  return agent.workspace;
}
