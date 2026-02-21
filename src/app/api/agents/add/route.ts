import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { getKitchenApi } from "@/lib/kitchen-api";

function normalizeAgentId(id: string) {
  const s = id.trim();
  if (!s) throw new Error("agent id is required");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(s)) {
    throw new Error("agent id must match /^[a-z0-9][a-z0-9-]{0,62}$/i");
  }
  return s;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      newAgentId?: string;
      agentId?: string; // legacy/compat: some callers send agentId
      name?: string;
      emoji?: string;
      theme?: string;
      avatar?: string;
      model?: string;
      overwrite?: boolean;
    };

    const newAgentId = normalizeAgentId(String(body.newAgentId ?? body.agentId ?? ""));
    const overwrite = Boolean(body.overwrite);

    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    if (!configPath.trim()) {
      return NextResponse.json({ ok: false, error: "Could not resolve config path" }, { status: 500 });
    }

    const raw = await fs.readFile(configPath, "utf8");
    const cfg = JSON.parse(raw) as {
      agents?: { defaults?: { workspace?: string }; list?: Array<Record<string, unknown>> };
    };

  const baseWorkspace = String(cfg?.agents?.defaults?.workspace ?? "").trim();
  if (!baseWorkspace) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
  }

  const newWorkspace = path.resolve(baseWorkspace, "..", `workspace-${newAgentId}`);

  const agentsList: Array<Record<string, unknown>> = Array.isArray(cfg?.agents?.list)
    ? (cfg.agents?.list as Array<Record<string, unknown>>)
    : [];
  const exists = agentsList.some((a) => String(a?.id ?? "").toLowerCase() === newAgentId.toLowerCase());
  if (exists && !overwrite) {
    return NextResponse.json({ ok: false, error: `Agent already exists: ${newAgentId}` }, { status: 409 });
  }

  const nextEntry: Record<string, unknown> = {
    id: newAgentId,
    workspace: newWorkspace,
    ...(body.model ? { model: body.model } : {}),
    identity: {
      ...(typeof body.name === "string" && body.name.trim() ? { name: body.name.trim() } : {}),
      ...(typeof body.theme === "string" && body.theme.trim() ? { theme: body.theme.trim() } : {}),
      ...(typeof body.emoji === "string" && body.emoji.trim() ? { emoji: body.emoji.trim() } : {}),
      ...(typeof body.avatar === "string" && body.avatar.trim() ? { avatar: body.avatar.trim() } : {}),
    },
  };

  const nextList = exists
    ? agentsList.map((a) => (String(a?.id ?? "").toLowerCase() === newAgentId.toLowerCase() ? nextEntry : a))
    : [...agentsList, nextEntry];

  // Ensure workspace directory exists and seed IDENTITY.md for clarity.
  await fs.mkdir(newWorkspace, { recursive: true });
  const identityMd = `# IDENTITY.md\n\n- **Name:** ${String(body.name ?? "").trim() || newAgentId}\n- **Creature:**\n- **Vibe:**\n- **Emoji:** ${String(body.emoji ?? "").trim()}\n- **Avatar:** ${String(body.avatar ?? "").trim()}\n`;
  await fs.writeFile(path.join(newWorkspace, "IDENTITY.md"), identityMd, "utf8");

  // Persist to ~/.openclaw/openclaw.json
  const nextCfg = {
    ...cfg,
    agents: {
      ...(cfg.agents ?? {}),
      list: nextList,
    },
  };

  // Write atomically.
  const tmpPath = `${configPath}.tmp`;
  const bakPath = `${configPath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await fs.writeFile(tmpPath, JSON.stringify(nextCfg, null, 2) + "\n", "utf8");
  await fs.copyFile(configPath, bakPath).catch(() => {});
  await fs.rename(tmpPath, configPath);

  // Restart gateway so the new agent is live.
  const api = getKitchenApi();
  await api.runtime.system.runCommandWithTimeout(["openclaw", "gateway", "restart"], { timeoutMs: 120000 });

  return NextResponse.json({ ok: true, agentId: newAgentId, workspace: newWorkspace, restarted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Prefer 400 for validation/input errors; otherwise 500.
    const status = /required|match \//i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
