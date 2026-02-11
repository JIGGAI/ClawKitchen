import fs from "node:fs/promises";
import path from "node:path";

type OpenClawConfig = {
  agents?: { defaults?: { workspace?: string } };
  gateway?: { port?: number; auth?: { token?: string } };
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

export async function getWorkspaceRecipesDir() {
  const cfg = await readOpenClawConfig();
  const ws = cfg.agents?.defaults?.workspace;
  if (!ws) throw new Error("agents.defaults.workspace is not set in ~/.openclaw/openclaw.json");
  return path.join(ws, "recipes");
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
