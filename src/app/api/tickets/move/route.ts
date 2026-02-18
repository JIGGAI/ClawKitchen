import { NextResponse } from "next/server";
import { execFileAsync } from "@/lib/exec";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ticket = String(body.ticket ?? "").trim();
    const to = String(body.to ?? "").trim();

    if (!ticket) {
      return NextResponse.json({ ok: false, error: "Missing ticket" }, { status: 400 });
    }
    if (!to || !["backlog", "in-progress", "testing", "done"].includes(to)) {
      return NextResponse.json({ ok: false, error: "Invalid destination stage" }, { status: 400 });
    }

    const args = [
      "recipes",
      "move-ticket",
      "--team-id",
      "development-team",
      "--ticket",
      ticket,
      "--to",
      to,
      "--yes",
    ];

    await execFileAsync("openclaw", args, { timeout: 30_000 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
