import { NextResponse } from "next/server";
import { gatewayRequest } from "@/lib/chat/gateway-client";
import { isChatSessionKey } from "@/lib/chat/messages";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { session?: unknown } | null;
  const session = typeof body?.session === "string" ? body.session : "";
  if (!isChatSessionKey(session)) return NextResponse.json({ ok: false, error: "Not a chat thread" }, { status: 400 });
  try {
    const out = await gatewayRequest<{ aborted?: unknown }>("chat.abort", { sessionKey: session });
    return NextResponse.json({ ok: true, aborted: out?.aborted === true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 502 });
  }
}
