import fs from "node:fs/promises";
import path from "node:path";
import { runOpenClaw } from "@/lib/openclaw";

export type CronScope = { kind: "team" | "agent"; id: string; label: string; href: string };

function hrefForScope(scope: { kind: "team" | "agent"; id: string }) {
  return scope.kind === "team" ? `/teams/${encodeURIComponent(scope.id)}` : `/agents/${encodeURIComponent(scope.id)}`;
}

type CronEntry = { installedCronId?: unknown; orphaned?: unknown };

function addEntriesToScopeMap(
  entries: Record<string, CronEntry>,
  scopeId: string,
  kind: "team" | "agent",
  idToScope: Map<string, CronScope>
): void {
  for (const [k, v] of Object.entries(entries)) {
    if (!v || Boolean(v.orphaned)) continue;
    const installedCronId = String(v.installedCronId ?? "").trim();
    if (!installedCronId) continue;

    // Workflow worker cron provenance keys should resolve to team scope.
    // New format: team:<teamId>:recipe:workflow-worker:cron:<agentId>
    // Legacy format: workflow-worker:<teamId>:<agentId>
    {
      const newFmt = String(k).match(/^team:([^:]+):recipe:workflow-worker:cron:/);
      const legacyFmt = !newFmt && kind === "agent" ? String(k).match(/^workflow-worker:([^:]+):/) : null;
      const teamId = String((newFmt ?? legacyFmt)?.[1] ?? "").trim();
      if (teamId) {
        idToScope.set(installedCronId, {
          kind: "team",
          id: teamId,
          label: teamId,
          href: hrefForScope({ kind: "team", id: teamId }),
        });
        continue;
      }
    }

    idToScope.set(installedCronId, { kind, id: scopeId, label: scopeId, href: hrefForScope({ kind, id: scopeId }) });
  }
}

async function collectAgentScopes(idToScope: Map<string, CronScope>): Promise<void> {
  try {
    const cfgText = await runOpenClaw(["config", "get", "agents.list", "--no-color"]);
    if (!cfgText.ok) return;
    const list = JSON.parse(String(cfgText.stdout ?? "[]")) as Array<{ id?: unknown; workspace?: unknown }>;
    for (const a of list) {
      const agentId = String(a.id ?? "");
      const workspace = String(a.workspace ?? "");
      if (!agentId || !workspace) continue;
      const cronPath = path.join(workspace, "notes", "cron-jobs.json");
      try {
        const raw = await fs.readFile(cronPath, "utf8");
        const json = JSON.parse(raw) as { entries?: Record<string, CronEntry> };
        addEntriesToScopeMap(json.entries ?? {}, agentId, "agent", idToScope);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

export async function buildIdToScopeMap(baseWorkspace: string): Promise<Map<string, CronScope>> {
  const idToScope = new Map<string, CronScope>();
  const baseHome = path.resolve(baseWorkspace, "..");
  const entries = await fs.readdir(baseHome, { withFileTypes: true });

  for (const ent of entries) {
    if (!ent.isDirectory() || !ent.name.startsWith("workspace-")) continue;
    const scopeId = ent.name.replace(/^workspace-/, "");
    const teamJsonPath = path.join(baseHome, ent.name, "team.json");
    const teamNotesCronPath = path.join(baseHome, ent.name, "notes", "cron-jobs.json");
    try {
      await fs.stat(teamJsonPath);
    } catch {
      continue;
    }
    try {
      const raw = await fs.readFile(teamNotesCronPath, "utf8");
      const json = JSON.parse(raw) as { entries?: Record<string, CronEntry> };
      addEntriesToScopeMap(json.entries ?? {}, scopeId, "team", idToScope);
    } catch {
      // ignore
    }
  }

  await collectAgentScopes(idToScope);
  return idToScope;
}

export async function getInstalledIdsForTeam(provenancePath: string): Promise<string[]> {
  try {
    const text = await fs.readFile(provenancePath, "utf8");
    const json = JSON.parse(text) as { entries?: Record<string, { installedCronId?: unknown; orphaned?: unknown }> };
    const entries = json.entries ?? {};
    return Object.values(entries)
      .filter((e) => !Boolean(e.orphaned))
      .map((e) => String(e.installedCronId ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function enrichJobsWithScope(
  jobs: unknown[],
  idToScope: Map<string, CronScope>
): Array<unknown & { scope?: CronScope }> {
  return jobs.map((j) => {
    const id = String((j as { id?: unknown }).id ?? "");
    const scope = id ? idToScope.get(id) : undefined;
    return (scope ? { ...(j as object), scope } : j) as unknown & { scope?: CronScope };
  });
}

type MappingStateV1 = {
  version: 1;
  entries: Record<string, { installedCronId: string; orphaned?: boolean }>;
};

async function markOrphanedInOneMapping(
  id: string,
  mappingPath: string,
  teamId: string
): Promise<{ teamId: string; mappingPath: string; keys: string[] } | null> {
  try {
    const rawMapping = await fs.readFile(mappingPath, "utf8");
    const mapping = JSON.parse(rawMapping) as MappingStateV1;
    if (!mapping || mapping.version !== 1 || !mapping.entries) return null;

    let changed = false;
    const keys: string[] = [];
    for (const [k, v] of Object.entries(mapping.entries)) {
      if (String(v?.installedCronId ?? "").trim() === id && !v.orphaned) {
        mapping.entries[k] = { ...v, orphaned: true };
        changed = true;
        keys.push(k);
      }
    }
    if (!changed) return null;
    await fs.writeFile(mappingPath, JSON.stringify(mapping, null, 2) + "\n", "utf8");
    return { teamId, mappingPath, keys };
  } catch {
    return null;
  }
}

export async function markOrphanedInTeamWorkspaces(
  id: string,
  baseWorkspace: string
): Promise<Array<{ teamId: string; mappingPath: string; keys: string[] }>> {
  const orphanedIn: Array<{ teamId: string; mappingPath: string; keys: string[] }> = [];
  const baseHome = path.resolve(baseWorkspace, "..");
  const entries = await fs.readdir(baseHome, { withFileTypes: true });

  for (const ent of entries) {
    if (!ent.isDirectory() || !ent.name.startsWith("workspace-")) continue;
    const teamId = ent.name.replace(/^workspace-/, "");
    const teamJsonPath = path.join(baseHome, ent.name, "team.json");
    const mappingPath = path.join(baseHome, ent.name, "notes", "cron-jobs.json");
    try {
      await fs.stat(teamJsonPath);
    } catch {
      continue;
    }
    const result = await markOrphanedInOneMapping(id, mappingPath, teamId);
    if (result) orphanedIn.push(result);
  }

  return orphanedIn;
}

export async function getBaseWorkspaceFromGateway(
  toolsInvoke: (opts: { tool: string; args?: Record<string, unknown> }) => Promise<unknown>
): Promise<string> {
  const cfg = (await toolsInvoke({
    tool: "gateway",
    args: { action: "config.get", raw: "{}" },
  })) as { content?: Array<{ type: string; text?: string }> };
  const cfgText = cfg?.content?.find((c) => c.type === "text")?.text ?? "";
  const env = cfgText ? (JSON.parse(cfgText) as { result?: { raw?: string } }) : null;
  const raw = String(env?.result?.raw ?? "");
  const parsedRaw = raw ? (JSON.parse(raw) as { agents?: { defaults?: { workspace?: string } } }) : null;
  return String(parsedRaw?.agents?.defaults?.workspace ?? "").trim();
}
