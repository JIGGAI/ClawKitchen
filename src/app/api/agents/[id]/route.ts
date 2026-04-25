import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { runOpenClaw } from "@/lib/openclaw";
import { invalidateOpenClawCache } from "@/lib/openclaw-cache";
import { listAgentsCached } from "@/lib/agents";
import { parseTeamRoleWorkspace } from "@/lib/agent-workspace";

async function resolveAgentWorkspace(agentId: string): Promise<string | null> {
  try {
    const list = await listAgentsCached();
    const agent = list.find((a) => a.id === agentId);
    return agent?.workspace ? String(agent.workspace) : null;
  } catch {
    return null;
  }
}

async function moveTeamRoleToTrashOrRemove(info: {
  teamDir: string;
  role: string;
  roleDir: string;
}): Promise<void> {
  const trashDir = path.join(info.teamDir, ".trash", "roles");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = path.join(trashDir, `${info.role}-${ts}`);
  try {
    await fs.mkdir(trashDir, { recursive: true });
    await fs.rename(info.roleDir, dst);
  } catch {
    try {
      await fs.rm(info.roleDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const agentId = String(id ?? "").trim();
    if (!agentId) return NextResponse.json({ ok: false, error: "agent id is required" }, { status: 400 });

    const workspace = await resolveAgentWorkspace(agentId);

    const result = await runOpenClaw(["agents", "delete", agentId, "--force", "--json"]);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to delete agent: ${agentId}`,
          stderr: result.stderr || undefined,
          stdout: result.stdout || undefined,
        },
        { status: 500 },
      );
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      parsed = null;
    }

    if (workspace) {
      const info = parseTeamRoleWorkspace(workspace);
      if (info.kind === "teamRole") await moveTeamRoleToTrashOrRemove(info);
    }

    // Bust the agents-list cache so the next read reflects the deletion.
    invalidateOpenClawCache(["agents", "list"]);

    return NextResponse.json({ ok: true, result: parsed ?? result.stdout });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to delete agent",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
