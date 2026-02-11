import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string; action?: string };
  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "").trim();

  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  if (!["enable", "disable", "run"].includes(action)) {
    return NextResponse.json({ ok: false, error: "action must be enable|disable|run" }, { status: 400 });
  }

  if (action === "run") {
    const { stdout, stderr } = await runOpenClaw(["cron", "run", id, "--json"]);
    return NextResponse.json({ ok: true, action, id, stdout, stderr });
  }

  const flag = action === "enable" ? "--enable" : "--disable";
  const { stdout, stderr } = await runOpenClaw(["cron", "edit", id, flag, "--json"].filter(Boolean));
  return NextResponse.json({ ok: true, action, id, stdout, stderr });
}
