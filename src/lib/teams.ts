import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const HIDDEN_TEAM_IDS = new Set(["attestations"]);

export async function listLocalTeamIds(): Promise<string[]> {
  const home = os.homedir();
  if (!home) return [];
  const base = path.join(home, ".openclaw");

  let entries: Array<{ name: string; isDirectory(): boolean }> = [];
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith("workspace-"))
    .map((e) => e.name.replace(/^workspace-/, ""))
    .filter((id) => !!id && !HIDDEN_TEAM_IDS.has(id))
    .sort();
}
