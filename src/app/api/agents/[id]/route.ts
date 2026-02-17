import { NextResponse } from "next/server";

import { runOpenClaw } from "@/lib/openclaw";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const agentId = String(id ?? "").trim();
    if (!agentId) return NextResponse.json({ ok: false, error: "agent id is required" }, { status: 400 });

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
