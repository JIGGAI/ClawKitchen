import fs from "node:fs/promises";
import path from "node:path";
import { readOpenClawConfig, teamDirFromBaseWorkspace } from "@/lib/paths";

type TeamMeta = Record<string, unknown> & {
  enabledPlugins?: unknown;
};

function normalizeEnabledPlugins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))).sort();
}

export async function resolveTeamDir(teamId: string): Promise<string> {
  const cfg = await readOpenClawConfig();
  const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
  if (!baseWorkspace) throw new Error("agents.defaults.workspace not set");
  return teamDirFromBaseWorkspace(baseWorkspace, teamId);
}

export async function readTeamMeta(teamDir: string): Promise<TeamMeta> {
  const metaPath = path.join(teamDir, "team.json");
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as TeamMeta) : {};
  } catch {
    return {};
  }
}

export async function writeTeamMeta(teamDir: string, meta: TeamMeta): Promise<void> {
  const metaPath = path.join(teamDir, "team.json");
  await fs.mkdir(teamDir, { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
}

export async function getEnabledPlugins(teamDir: string): Promise<string[]> {
  const meta = await readTeamMeta(teamDir);
  return normalizeEnabledPlugins(meta.enabledPlugins);
}

export async function setPluginEnabled(teamDir: string, pluginId: string, enabled: boolean): Promise<string[]> {
  const meta = await readTeamMeta(teamDir);
  const current = normalizeEnabledPlugins(meta.enabledPlugins);
  const next = enabled ? Array.from(new Set([...current, pluginId])).sort() : current.filter((id) => id !== pluginId);
  meta.enabledPlugins = next;
  await writeTeamMeta(teamDir, meta);
  return next;
}

export async function isPluginEnabledForTeam(teamId: string, pluginId: string): Promise<boolean> {
  const teamDir = await resolveTeamDir(teamId);
  const enabled = await getEnabledPlugins(teamDir);
  return enabled.includes(pluginId);
}
