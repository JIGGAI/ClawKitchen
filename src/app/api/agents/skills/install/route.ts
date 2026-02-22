import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { parseTeamRoleWorkspace } from "@/lib/agent-workspace";

export async function POST(req: Request) {
  const body = (await req.json()) as { agentId?: string; skill?: string };
  const agentId = String(body.agentId ?? "").trim();
  const skill = String(body.skill ?? "").trim();

  if (!agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });
  if (!skill) return NextResponse.json({ ok: false, error: "skill is required" }, { status: 400 });

  // For role-based team agents, install at team scope to avoid creating a separate
  // workspace-<agentId> directory that diverges from roles/<role>.
  let args = ["recipes", "install-skill", skill, "--agent-id", agentId, "--yes"];
  try {
    const { stdout } = await runOpenClaw(["agents", "list", "--json"]);
    const list = JSON.parse(stdout) as Array<{ id: string; workspace?: string }>;
    const agent = list.find((a) => a.id === agentId);
    const ws = agent?.workspace ? String(agent.workspace) : "";
    const info = parseTeamRoleWorkspace(ws);
    if (info.kind === "teamRole") {
      args = ["recipes", "install-skill", skill, "--team-id", info.teamId, "--yes"];
    }
  } catch {
    // If anything goes wrong, fall back to agent scope.
  }

  const res = await runOpenClaw(args);
  if (!res.ok) {
    const stdout = res.stdout?.trim();
    const stderr = res.stderr?.trim();
    return NextResponse.json(
      {
        ok: false,
        error: stderr || stdout || `openclaw ${args.join(" ")} failed (exit=${res.exitCode})`,
        stdout: res.stdout,
        stderr: res.stderr,
        scopeArgs: args,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, agentId, skill, scopeArgs: args, stdout: res.stdout, stderr: res.stderr });
}
