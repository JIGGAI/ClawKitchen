import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { execFileAsync } from "@/lib/exec";
import { teamDirFromBaseWorkspace } from "@/lib/paths";

function normalizeAgentId(id: string) {
  const s = id.trim();
  if (!s) throw new Error("agent id is required");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(s)) {
    throw new Error("agent id must match /^[a-z0-9][a-z0-9-]{0,62}$/i");
  }
  return s;
}

function buildAgentEntry(
  body: { newAgentId?: string; agentId?: string; name?: string; emoji?: string; theme?: string; avatar?: string; model?: string },
  newAgentId: string,
  newWorkspace: string
): Record<string, unknown> {
  const identity: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) identity.name = body.name.trim();
  if (typeof body.theme === "string" && body.theme.trim()) identity.theme = body.theme.trim();
  if (typeof body.emoji === "string" && body.emoji.trim()) identity.emoji = body.emoji.trim();
  if (typeof body.avatar === "string" && body.avatar.trim()) identity.avatar = body.avatar.trim();

  return {
    id: newAgentId,
    workspace: newWorkspace,
    ...(body.model ? { model: body.model } : {}),
    identity,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      newAgentId?: string;
      agentId?: string;
      name?: string;
      emoji?: string;
      theme?: string;
      avatar?: string;
      model?: string;
      overwrite?: boolean;
    };

    const newAgentId = normalizeAgentId(String(body.newAgentId ?? body.agentId ?? ""));
    const overwrite = Boolean(body.overwrite);

    if (!process.env.HOME) {
      return NextResponse.json({ ok: false, error: "HOME is not set" }, { status: 500 });
    }

    const configPath = path.join(process.env.HOME, ".openclaw", "openclaw.json");
    const raw = await fs.readFile(configPath, "utf8");
    const cfg = JSON.parse(raw) as {
      agents?: { defaults?: { workspace?: string }; list?: Array<Record<string, unknown>> };
    };

    const baseWorkspace = String(cfg?.agents?.defaults?.workspace ?? "").trim();
    if (!baseWorkspace) {
      return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
    }

    const newWorkspace = teamDirFromBaseWorkspace(baseWorkspace, newAgentId);
    const agentsList: Array<Record<string, unknown>> = Array.isArray(cfg?.agents?.list) ? cfg.agents.list : [];
    const exists = agentsList.some((a) => String(a?.id ?? "").toLowerCase() === newAgentId.toLowerCase());
    if (exists && !overwrite) {
      return NextResponse.json({ ok: false, error: `Agent already exists: ${newAgentId}` }, { status: 409 });
    }

    const nextEntry = buildAgentEntry(body, newAgentId, newWorkspace);
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
  await execFileAsync("openclaw", ["gateway", "restart"], { timeout: 120000 });

  return NextResponse.json({ ok: true, agentId: newAgentId, workspace: newWorkspace, restarted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Prefer 400 for validation/input errors; otherwise 500.
    const status = /required|match \//i.test(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
