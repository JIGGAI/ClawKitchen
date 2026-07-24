import { runOpenClaw } from "@/lib/openclaw";

export type AgentListItem = {
  id: string;
  identityName?: string | null;
  workspace?: string | null;
};

export type SessionListItem = {
  key: string;
  updatedAt: number;
  ageMs?: number;
  agentId: string;
  kind?: string;
  model?: string;
  contextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export function inferTeamIdFromWorkspace(workspace: string | null | undefined) {
  if (!workspace) return null;
  const parts = workspace.split("/").filter(Boolean);
  const wsPart = parts.find((p) => p.startsWith("workspace-")) ?? "";
  if (!wsPart) return null;
  const team = wsPart.slice("workspace-".length);
  return team || null;
}

export async function getAgents(): Promise<AgentListItem[]> {
  const res = await runOpenClaw(["agents", "list", "--json"]);
  if (!res.ok) return [];
  return JSON.parse(res.stdout) as AgentListItem[];
}

export async function getActiveSessions(minutes: number): Promise<SessionListItem[]> {
  const res = await runOpenClaw(["sessions", "--active", String(minutes), "--all-agents", "--json"]);
  if (!res.ok) return [];
  const parsed = JSON.parse(res.stdout) as { sessions?: SessionListItem[] };
  return Array.isArray(parsed.sessions) ? parsed.sessions : [];
}
