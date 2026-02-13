import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { gatewayConfigGet, gatewayConfigPatch } from "@/lib/gateway";

function normalizeAgentId(id: string) {
  const s = id.trim();
  if (!s) throw new Error("agent id is required");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(s)) {
    throw new Error("agent id must match /^[a-z0-9][a-z0-9-]{0,62}$/i");
  }
  return s;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    newAgentId?: string;
    name?: string;
    emoji?: string;
    theme?: string;
    avatar?: string;
    model?: string;
    overwrite?: boolean;
  };

  const newAgentId = normalizeAgentId(String(body.newAgentId ?? ""));
  const overwrite = Boolean(body.overwrite);

  const { raw } = await gatewayConfigGet();
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

  await gatewayConfigPatch({ agents: { list: nextList } }, `ClawKitchen: add agent ${newAgentId}`);

  return NextResponse.json({ ok: true, agentId: newAgentId, workspace: newWorkspace });
}
