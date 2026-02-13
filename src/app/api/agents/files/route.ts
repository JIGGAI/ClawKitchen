import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";

type AgentListItem = {
  id: string;
  identityName?: string;
  workspace?: string;
};

async function resolveAgentWorkspace(agentId: string) {
  const { stdout } = await runOpenClaw(["agents", "list", "--json"]);
  const list = JSON.parse(stdout) as AgentListItem[];
  const agent = list.find((a) => a.id === agentId);
  if (!agent?.workspace) throw new Error(`Agent workspace not found for ${agentId}`);
  return agent.workspace;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agentId = String(searchParams.get("agentId") ?? "").trim();
  if (!agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });

  const ws = await resolveAgentWorkspace(agentId);

  const candidates = ["IDENTITY.md", "SOUL.md", "USER.md", "AGENTS.md", "TOOLS.md", "HEARTBEAT.md", "MEMORY.md"];

  const files = await Promise.all(
    candidates.map(async (name) => {
      const p = path.join(ws, name);
      try {
        const st = await fs.stat(p);
        return { name, path: p, missing: false, size: st.size, updatedAtMs: st.mtimeMs };
      } catch {
        return { name, path: p, missing: true };
      }
    })
  );

  return NextResponse.json({ ok: true, agentId, workspace: ws, files });
}
