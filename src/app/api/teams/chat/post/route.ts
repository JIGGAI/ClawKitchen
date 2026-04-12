import { NextResponse } from "next/server";
import { parseJsonBody, withStorageError, getTeamContextFromBody } from "@/lib/api-route-helpers";
import { appendChatMessage } from "@/lib/chat/chat-storage";

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req);
  if (parsed instanceof NextResponse) return parsed;

  const body = parsed.body as { teamId?: unknown; roomId?: unknown; text?: unknown };
  const ctx = await getTeamContextFromBody({ teamId: body.teamId as string });
  if (ctx instanceof NextResponse) return ctx;

  const roomId = String(body.roomId ?? "team").trim() || "team";
  const text = String(body.text ?? "");

  // MVP: author identity is best-effort until we plumb Kitchen session user identity into API routes.
  const author = { kind: "human" as const, id: "kitchen" };

  return withStorageError(async () => {
    const r = await appendChatMessage({ teamDir: ctx.teamDir, roomId, text, author });
    if (!r.ok) return r;
    return { ok: true, message: r.message, file: r.file };
  });
}

export const dynamic = "force-dynamic";
