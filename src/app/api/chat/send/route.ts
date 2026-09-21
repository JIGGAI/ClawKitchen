import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { gatewayRequest } from "@/lib/chat/gateway-client";
import { isChatSessionKey } from "@/lib/chat/messages";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 100_000;
const SEND_TIMEOUT_MS = 60_000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { session?: unknown; message?: unknown } | null;
  const session = typeof body?.session === "string" ? body.session : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!isChatSessionKey(session)) return NextResponse.json({ ok: false, error: "Not a chat thread" }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) return NextResponse.json({ ok: false, error: "message is too long" }, { status: 400 });
  try {
    // chat.send returns as soon as the run starts; the reply arrives on /api/chat/stream.
    const out = await gatewayRequest<{ runId?: unknown; status?: unknown }>(
      "chat.send",
      { sessionKey: session, message, idempotencyKey: randomUUID() },
      SEND_TIMEOUT_MS,
    );
    return NextResponse.json({ ok: true, runId: out?.runId ?? null, status: out?.status ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 502 });
  }
}
