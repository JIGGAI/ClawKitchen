import { NextResponse } from "next/server";
import { ensureGatewayConnected, onGatewayEvent } from "@/lib/chat/gateway-client";
import { isChatSessionKey, toStreamEvent } from "@/lib/chat/messages";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

/** The session's chat events (reply deltas, final, aborted, error) as Server-Sent Events. */
export async function GET(req: Request) {
  const session = (new URL(req.url).searchParams.get("session") ?? "").trim();
  if (!isChatSessionKey(session)) return NextResponse.json({ ok: false, error: "Not a chat thread" }, { status: 400 });
  try {
    await ensureGatewayConnected();
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 502 });
  }

  const encoder = new TextEncoder();
  let stop = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      const off = onGatewayEvent((event, payload) => {
        if (event !== "chat" || (payload as { sessionKey?: unknown } | null)?.sessionKey !== session) return;
        const ev = toStreamEvent(payload);
        if (ev) write(`data: ${JSON.stringify(ev)}\n\n`);
      });
      const heartbeat = setInterval(() => write(": keep-alive\n\n"), HEARTBEAT_MS);
      stop = () => {
        if (closed) return;
        closed = true;
        off();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      req.signal.addEventListener("abort", () => stop());
      write(": connected\n\n");
    },
    cancel() {
      stop();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
