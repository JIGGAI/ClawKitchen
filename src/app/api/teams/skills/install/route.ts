import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";

export async function POST(req: Request) {
  const body = (await req.json()) as { teamId?: string; skill?: string };
  const teamId = String(body.teamId ?? "").trim();
  const skill = String(body.skill ?? "").trim();

  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });
  if (!skill) return NextResponse.json({ ok: false, error: "skill is required" }, { status: 400 });

  const args = ["recipes", "install-skill", skill, "--team-id", teamId, "--yes"];
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
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, teamId, skill, stdout: res.stdout, stderr: res.stderr });
}
