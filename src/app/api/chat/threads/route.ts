import { NextResponse } from "next/server";
import { gatewayRequest } from "@/lib/chat/gateway-client";
import { isAgentId, isChatSessionKey, toThreads } from "@/lib/chat/messages";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const agent = (new URL(req.url).searchParams.get("agent") ?? "").trim();
  if (!isAgentId(agent)) return NextResponse.json({ ok: false, error: "agent is required" }, { status: 400 });
  try {
    const out = await gatewayRequest<{ sessions?: unknown }>("sessions.list", {
      agentId: agent,
      limit: 200,
      includeDerivedTitles: true,
      includeLastMessage: true,
    });
    return NextResponse.json({ ok: true, threads: toThreads(agent, out?.sessions) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { agent?: unknown; label?: unknown } | null;
  const agent = typeof body?.agent === "string" ? body.agent.trim() : "";
  if (!isAgentId(agent)) return NextResponse.json({ ok: false, error: "agent is required" }, { status: 400 });
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 80) : "";
  try {
    const out = await gatewayRequest<{ key?: unknown }>("sessions.create", { agentId: agent, ...(label ? { label } : {}) });
    if (!isChatSessionKey(out?.key)) throw new Error("The gateway returned an unexpected thread key.");
    return NextResponse.json({ ok: true, key: out.key });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 502 });
  }
}
