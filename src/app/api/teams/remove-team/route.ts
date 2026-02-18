import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { findRecipeById } from "@/lib/recipes";

export async function POST(req: Request) {
  const body = (await req.json()) as { teamId?: string; includeAmbiguous?: boolean };
  const teamId = String(body.teamId ?? "").trim();
  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });

  const match = await findRecipeById(teamId);
  if (match?.kind === "team" && match.source === "builtin") {
    return NextResponse.json(
      { ok: false, error: `Refusing to delete builtin team: ${teamId}. Clone to a custom team first.` },
      { status: 403 },
    );
  }

  const args = ["recipes", "remove-team", "--team-id", teamId, "--yes", "--json"];
  if (body.includeAmbiguous) args.push("--include-ambiguous");

  const res = await runOpenClaw(args);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.stderr.trim() || `openclaw ${args.join(" ")} failed (exit=${res.exitCode})`, stdout: res.stdout, stderr: res.stderr },
      { status: 500 },
    );
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    parsed = { raw: res.stdout };
  }

  return NextResponse.json({ ok: true, result: parsed, stderr: res.stderr });
}
