import { unstable_noStore as noStore } from "next/cache";
import { type AgentListItem } from "@/lib/agents";
import { APP_VERSION } from "@/lib/app-info";
import { runOpenClaw } from "@/lib/openclaw";
import { listRecipes } from "@/lib/recipes";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
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
  // Home should always reflect the current OpenClaw state (teams/agents can change outside Next).
  noStore();

  const [agents, { teamNames }] = await Promise.all([getAgents(), getTeamsFromRecipes()]);
  return <HomeClient agents={agents} teamNames={teamNames} appVersion={APP_VERSION} />;
}
