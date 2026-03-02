import fs from "node:fs/promises";

import { NextResponse } from "next/server";

import { runOpenClaw } from "@/lib/openclaw";
import { getTicketMarkdown } from "@/lib/tickets";

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function appendDoneAuditComment(teamId: string, ticketIdOrNumber: string) {
  const hit = await getTicketMarkdown(teamId, ticketIdOrNumber);
  if (!hit) return;

  const line = `- ${todayUtc()} (ClawKitchen UI): Marked done from ClawKitchen UI.`;
  if (hit.markdown.includes(line)) return;

  const hasComments = /\n## Comments\n/i.test(hit.markdown) || /^## Comments\n/im.test(hit.markdown);

  let next = hit.markdown;
  if (!hasComments) {
    next = next.replace(/\s*$/, "\n\n## Comments\n");
  }

  // Append at end; this keeps the operation simple and avoids brittle section parsing.
  next = next.replace(/\s*$/, "\n" + line + "\n");

  await fs.writeFile(hit.file, next, "utf8");
}

export async function POST(req: Request, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await ctx.params;
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
      teamId,
      "--ticket",
      ticket,
      "--to",
      to,
      "--yes",
    ];

    const res = await runOpenClaw(args);
    if (!res.ok) throw new Error(res.stderr || `openclaw exit ${res.exitCode}`);

    if (to === "done") {
      await appendDoneAuditComment(teamId, ticket);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
