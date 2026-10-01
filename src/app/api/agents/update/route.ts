import { NextResponse } from "next/server";
import { detectAgentsShape, readAgents, type AgentsConfigMutable } from "@/lib/agents-shape";
import { gatewayConfigGet, gatewayConfigPatch } from "@/lib/gateway";

function normalizeAgentId(id: string) {
  const s = id.trim();
  if (!s) throw new Error("agentId is required");
  return s;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    agentId?: string;
    patch?: {
      workspace?: string;
      model?: string;
      identity?: { name?: string; theme?: string; emoji?: string; avatar?: string };
    };
  };

  const agentId = normalizeAgentId(String(body.agentId ?? ""));
  const patch = body.patch ?? {};

  const { raw } = await gatewayConfigGet();
  const cfg = JSON.parse(raw) as AgentsConfigMutable;

  // Read/write through agents-shape so this works whether the host stores
  // agents as `agents.entries` (current) or `agents.list` (legacy).
  const list = readAgents(cfg);
  const idx = list.findIndex((a) => String(a.id ?? "").toLowerCase() === agentId.toLowerCase());
  if (idx === -1) return NextResponse.json({ ok: false, error: `Agent not found in config: ${agentId}` }, { status: 404 });

  const current = list[idx] ?? {};
  const currentIdentity = (current.identity ?? {}) as Record<string, unknown>;

  const next: Record<string, unknown> = {
    ...current,
    ...(typeof patch.workspace === "string" && patch.workspace.trim() ? { workspace: patch.workspace.trim() } : {}),
    ...(typeof patch.model === "string" && patch.model.trim() ? { model: patch.model.trim() } : {}),
    identity: {
      ...currentIdentity,
      ...(typeof patch.identity?.name === "string" ? { name: patch.identity.name } : {}),
      ...(typeof patch.identity?.theme === "string" ? { theme: patch.identity.theme } : {}),
      ...(typeof patch.identity?.emoji === "string" ? { emoji: patch.identity.emoji } : {}),
      ...(typeof patch.identity?.avatar === "string" ? { avatar: patch.identity.avatar } : {}),
    },
  };

  // Patch the shape this config actually uses. Sending `agents.list` to a host
  // that stores `agents.entries` adds a stale array that OpenClaw then migrates
  // back over the real entries, silently reverting agent settings.
  if (detectAgentsShape(cfg) === "list") {
    const nextList = list.slice();
    nextList[idx] = next;
    await gatewayConfigPatch({ agents: { list: nextList } }, `ClawKitchen: update agent ${agentId}`);
  } else {
    // The id is the key here, not a field. Patch just this entry; config patch
    // merges objects recursively, so the rest of the map is untouched.
    const key = String(list[idx]?.id ?? agentId);
    const entry = { ...next };
    delete entry.id;
    await gatewayConfigPatch({ agents: { entries: { [key]: entry } } }, `ClawKitchen: update agent ${agentId}`);
  }

  return NextResponse.json({ ok: true, agentId });
}
