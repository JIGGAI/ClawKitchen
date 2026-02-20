import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";

export async function POST(req: Request) {
  const body = (await req.json()) as { agentId?: string; skill?: string };
  const agentId = String(body.agentId ?? "").trim();
  const skill = String(body.skill ?? "").trim();

  if (!agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });
  if (!skill) return NextResponse.json({ ok: false, error: "skill is required" }, { status: 400 });

  const args = ["recipes", "install-skill", skill, "--agent-id", agentId, "--yes"];
  const res = await runOpenClaw(args);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.stderr.trim() || `openclaw ${args.join(" ")} failed (exit=${res.exitCode})`, stdout: res.stdout, stderr: res.stderr },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, agentId, skill, stdout: res.stdout, stderr: res.stderr });
}
