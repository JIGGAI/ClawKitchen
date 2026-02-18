import fs from "node:fs/promises";
import path from "node:path";

type OpenClawConfig = {
  agents?: { defaults?: { workspace?: string } };
  gateway?: { port?: number; auth?: { token?: string } };
  tools?: {
    agentToAgent?: {
      enabled?: boolean;
      allow?: string[];
    };
  };
  plugins?: {
    installs?: { recipes?: { installPath?: string; sourcePath?: string } };
    load?: { paths?: string[] };
  };
};

export async function readOpenClawConfig(): Promise<OpenClawConfig> {
  const p = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
  const text = await fs.readFile(p, "utf8");
  return JSON.parse(text) as OpenClawConfig;
}

export async function getWorkspaceDir() {
  const cfg = await readOpenClawConfig();
  const ws = cfg.agents?.defaults?.workspace;
  if (!ws) throw new Error("agents.defaults.workspace is not set in ~/.openclaw/openclaw.json");
  return ws;
}

export async function getWorkspaceRecipesDir() {
  const ws = await getWorkspaceDir();
  return path.join(ws, "recipes");
}

export async function getWorkspaceGoalsDir() {
  const ws = await getWorkspaceDir();
  return path.join(ws, "notes", "goals");
}

export async function getTeamWorkspaceDir(teamId: string) {
  const home = process.env.HOME || "";
  if (!home) throw new Error("HOME is not set");
  return path.join(home, ".openclaw", `workspace-${teamId}`);
}

/** Team workspace dir derived from agents.defaults.workspace (sibling: .. / workspace-{teamId}) */
export function teamDirFromBaseWorkspace(baseWorkspace: string, teamId: string) {
  return path.resolve(baseWorkspace, "..", `workspace-${teamId}`);
}

/** Rejects path traversal and empty names; returns normalized name. */
export function assertSafeRelativeFileName(name: string): string {
  const n = name.replace(/\\/g, "/");
  if (!n || n.startsWith("/") || n.includes("..")) throw new Error("Invalid file name");
  return n;
}

export async function getBuiltinRecipesDir() {
  const cfg = await readOpenClawConfig();
  const p =
    cfg.plugins?.installs?.recipes?.installPath ||
    cfg.plugins?.installs?.recipes?.sourcePath ||
    cfg.plugins?.load?.paths?.[0];
  if (!p) throw new Error("Could not determine recipes plugin install path from ~/.openclaw/openclaw.json");
  return path.join(p, "recipes", "default");
}
