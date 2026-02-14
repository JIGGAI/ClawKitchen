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

  // Required vs optional classification to avoid "missing" noise.
  const candidates: Array<{ name: string; required: boolean; rationale: string }> = [
    { name: "IDENTITY.md", required: true, rationale: "Identity (name/emoji/avatar)" },
    { name: "SOUL.md", required: true, rationale: "Agent persona/instructions" },
    { name: "AGENTS.md", required: true, rationale: "Agent operating rules" },
    { name: "TOOLS.md", required: true, rationale: "Agent local notes" },

    { name: "USER.md", required: false, rationale: "Optional user profile" },
    { name: "HEARTBEAT.md", required: false, rationale: "Optional periodic checklist" },
  ];

  const files = await Promise.all(
    candidates.map(async (c) => {
      const p = path.join(ws, c.name);
      try {
        const st = await fs.stat(p);
        return {
          name: c.name,
          required: c.required,
          rationale: c.rationale,
          path: p,
          missing: false,
          size: st.size,
          updatedAtMs: st.mtimeMs,
        };
      } catch {
        return { name: c.name, required: c.required, rationale: c.rationale, path: p, missing: true };
      }
    })
  );

  // Optional: MEMORY.md
  try {
    const p = path.join(ws, "MEMORY.md");
    const st = await fs.stat(p);
    files.push({
      name: "MEMORY.md",
      required: false,
      rationale: "Optional curated memory",
      path: p,
      missing: false,
      size: st.size,
      updatedAtMs: st.mtimeMs,
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, agentId, workspace: ws, files });
}
