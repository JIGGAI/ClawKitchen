import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";

export async function POST() {
  try {
    const r = await runOpenClaw(["gateway", "restart"]);
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: r.stderr.trim() || `openclaw gateway restart failed (exit=${r.exitCode})` },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? "") });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
