import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { errorMessage } from "@/lib/errors";
import { resolveTicket, teamWorkspace } from "@/lib/tickets";

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function appendGoalsAuditComment(file: string) {
  const md = await fs.readFile(file, "utf8");
  const line = `- ${todayUtc()} (ClawKitchen UI): Moved to Goals from ClawKitchen UI.`;
  if (md.includes(line)) return;

  const hasComments = /\n## Comments\n/i.test(md) || /^## Comments\n/im.test(md);

  let next = md;
  if (!hasComments) {
    next = next.replace(/\s*$/, "\n\n## Comments\n");
  }
  next = next.replace(/\s*$/, "\n" + line + "\n");

  await fs.writeFile(file, next, "utf8");
}

export async function POST(req: Request, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await ctx.params;
    const body = await req.json();
    const ticket = String(body.ticket ?? "").trim();

    if (!ticket) {
      return NextResponse.json({ ok: false, error: "Missing ticket" }, { status: 400 });
    }

    const hit = await resolveTicket(teamId, ticket);
    if (!hit) {
      return NextResponse.json({ ok: false, error: `Ticket not found: ${ticket}` }, { status: 404 });
    }

    const goalsDir = path.join(teamWorkspace(teamId), "work/goals");
    await fs.mkdir(goalsDir, { recursive: true });

    const dest = path.join(goalsDir, path.basename(hit.file));
    await fs.rename(hit.file, dest);

    await appendGoalsAuditComment(dest);

    return NextResponse.json({ ok: true, to: dest });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
