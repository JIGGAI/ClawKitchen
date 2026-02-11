import { NextResponse } from "next/server";
import { toolsInvoke } from "@/lib/gateway";

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string; action?: string };
  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "").trim();

  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  if (!["enable", "disable", "run"].includes(action)) {
    return NextResponse.json({ ok: false, error: "action must be enable|disable|run" }, { status: 400 });
  }

  if (action === "run") {
    const result = await toolsInvoke({ tool: "cron", args: { action: "run", jobId: id } });
    return NextResponse.json({ ok: true, action, id, result });
  }

  const patch = { enabled: action === "enable" };
  const result = await toolsInvoke({ tool: "cron", args: { action: "update", jobId: id, patch } });
  return NextResponse.json({ ok: true, action, id, result });
}
