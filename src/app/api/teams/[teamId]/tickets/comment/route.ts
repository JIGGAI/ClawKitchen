import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { errorMessage } from "@/lib/errors";
import { resolveTicket } from "@/lib/tickets";
import { formatTicketCommentMarkdown } from "@/lib/ticket-comments";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withLock(lockFile: string, fn: () => Promise<void>) {
  const started = Date.now();
  while (true) {
    try {
      const handle = await fs.open(lockFile, "wx");
      try {
        await fn();
      } finally {
        await handle.close();
        await fs.unlink(lockFile).catch(() => null);
      }
      return;
    } catch (e: unknown) {
      const code = typeof e === "object" && e && "code" in e ? (e as { code?: unknown }).code : undefined;
      if (code !== "EEXIST") throw e;
      if (Date.now() - started > 2000) throw new Error("Ticket is busy; please retry.");
      await sleep(50);
    }
  }
}

function ensureCommentsSectionAtEnd(md: string) {
  const has = /\n## Comments\n/i.test(md) || /^## Comments\n/im.test(md);
  if (has) return md;
  return md.replace(/\s*$/, "\n\n## Comments\n");
}

function insertComment(md: string, commentBlock: string) {
  const re = /^## Comments\s*$/gim;
  const m = re.exec(md);
  if (!m) {
    return ensureCommentsSectionAtEnd(md) + commentBlock;
  }

  const headerEnd = m.index + m[0].length;
  const rest = md.slice(headerEnd);
  const nextHeadingIdx = rest.search(/^##\s+/m);

  if (nextHeadingIdx === -1) {
    // Comments are last section.
    return md.replace(/\s*$/, "") + commentBlock + "\n";
  }

  // Insert before the next heading.
  const insertAt = headerEnd + nextHeadingIdx;
  return md.slice(0, insertAt).replace(/\s*$/, "") + commentBlock + "\n\n" + md.slice(insertAt).replace(/^\s+/, "");
}

export async function POST(req: Request, ctx: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await ctx.params;
    const body = (await req.json().catch(() => null)) as null | {
      ticket?: string;
      comment?: string;
      author?: string;
    };

    const ticketId = body?.ticket?.trim();
    const comment = body?.comment?.trim();
    const author = body?.author?.trim() || "unknown";

    if (!ticketId) return NextResponse.json({ error: "Missing ticket." }, { status: 400 });
    if (!comment) return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
    if (comment.length > 10_000) return NextResponse.json({ error: "Comment is too long." }, { status: 400 });

    const ticket = await resolveTicket(teamId, ticketId);
    if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

    const stamp = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
    const commentBlock = formatTicketCommentMarkdown({ timestamp: stamp, author, body: comment });

    const lockFile = path.join(path.dirname(ticket.file), `.${path.basename(ticket.file)}.comment.lock`);

    await withLock(lockFile, async () => {
      const current = await fs.readFile(ticket.file, "utf8");
      const next = insertComment(ensureCommentsSectionAtEnd(current), commentBlock);
      const tmp = `${ticket.file}.tmp`;
      await fs.writeFile(tmp, next, "utf8");
      await fs.rename(tmp, ticket.file);
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
