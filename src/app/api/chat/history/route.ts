import { NextResponse } from "next/server";
import { gatewayRequest } from "@/lib/chat/gateway-client";
import { isChatSessionKey, toChatMessages } from "@/lib/chat/messages";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = (new URL(req.url).searchParams.get("session") ?? "").trim();
  if (!isChatSessionKey(session)) return NextResponse.json({ ok: false, error: "Not a chat thread" }, { status: 400 });
  try {
    const out = await gatewayRequest<{ messages?: unknown; sessionInfo?: { hasActiveRun?: unknown } }>("chat.history", {
      sessionKey: session,
      limit: 200,
    });
    return NextResponse.json({
      ok: true,
      running: out?.sessionInfo?.hasActiveRun === true,
      messages: toChatMessages(out?.messages),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 502 });
  }
}
