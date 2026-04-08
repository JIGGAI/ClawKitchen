import { unstable_noStore as noStore } from "next/cache";
import { type AgentListItem } from "@/lib/agents";
import { APP_VERSION } from "@/lib/app-info";
import { runOpenClaw } from "@/lib/openclaw";
import { listRecipes } from "@/lib/recipes";
import { readManifest, isManifestStale, triggerManifestRegeneration } from "@/lib/manifest";
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
  noStore();

  // Try manifest first (single file read vs 2 subprocess calls)
  const manifest = await readManifest();
  if (manifest) {
    if (isManifestStale(manifest)) triggerManifestRegeneration();

    const agents: AgentListItem[] = manifest.agents;
    const teamNames: Record<string, string> = {};
    for (const r of manifest.recipes) {
      if (r.kind !== "team") continue;
      const name = String(r.name ?? "").trim();
      if (!name) continue;
      teamNames[r.id] = name;
    }
    return <HomeClient agents={agents} teamNames={teamNames} appVersion={APP_VERSION} />;
  }

  // Fallback: subprocess calls (manifest missing or corrupt)
  const [agents, { teamNames }] = await Promise.all([getAgents(), getTeamsFromRecipes()]);
  return <HomeClient agents={agents} teamNames={teamNames} appVersion={APP_VERSION} />;
}
