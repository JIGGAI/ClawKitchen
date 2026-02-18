import { type AgentListItem } from "@/lib/agents";
import { runOpenClaw } from "@/lib/openclaw";
import { listRecipes } from "@/lib/recipes";
import HomeClient from "./HomeClient";

async function getAgents(): Promise<AgentListItem[]> {
  const res = await runOpenClaw(["agents", "list", "--json"]);
  if (!res.ok) return [];
  return JSON.parse(res.stdout) as AgentListItem[];
}

async function getTeamsFromRecipes(): Promise<{ teamNames: Record<string, string> }> {
  const items = await listRecipes();
  const teamNames: Record<string, string> = {};
  for (const r of items) {
    if (r.kind !== "team") continue;
    const name = String(r.name ?? "").trim();
    if (!name) continue;
    teamNames[r.id] = name;
  }
  return { teamNames };
}

export default async function Home() {
  const [agents, { teamNames }] = await Promise.all([getAgents(), getTeamsFromRecipes()]);
  return <HomeClient agents={agents} teamNames={teamNames} />;
}
