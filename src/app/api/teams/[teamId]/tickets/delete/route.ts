import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { errorMessage } from "@/lib/errors";
import { resolveTicket, teamWorkspace } from "@/lib/tickets";

function pad4(n: number) {
  return String(n).padStart(4, "0");
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

    // Remove ticket file.
    await fs.unlink(hit.file);

    // Archive any assignment stubs (safer than deleting outright).
    const assignmentsDir = path.join(teamWorkspace(teamId), "work/assignments");
    const deletedDir = path.join(assignmentsDir, "deleted");
    await fs.mkdir(deletedDir, { recursive: true });

    const moved: string[] = [];
    try {
      const files = await fs.readdir(assignmentsDir);
      const prefix = `${pad4(hit.number)}-assigned-`;
      for (const f of files) {
        if (!f.startsWith(prefix) || !f.endsWith(".md")) continue;
        const from = path.join(assignmentsDir, f);
        const to = path.join(deletedDir, f);
        await fs.rename(from, to);
        moved.push(f);
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, archivedAssignments: moved });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
