import { NextResponse } from "next/server";
import { gatewayConfigGet, gatewayConfigPatch } from "@/lib/gateway";

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export async function GET() {
  try {
    const { raw, hash } = await gatewayConfigGet();
    const parsed = safeJsonParse(raw);
    const root = isRecord(parsed) ? parsed : {};
    const channels = isRecord(root.channels) ? root.channels : {};
    return NextResponse.json({ ok: true, hash, channels });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

type UpsertBody = {
  provider: string;
  config: Record<string, unknown>;
};

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as UpsertBody;
    const provider = String(body?.provider ?? "").trim();
    if (!provider) return NextResponse.json({ ok: false, error: "provider is required" }, { status: 400 });

    const cfg = isRecord(body?.config) ? body.config : null;
    if (!cfg) return NextResponse.json({ ok: false, error: "config must be an object" }, { status: 400 });

    // v1 validation (Telegram as reference)
    if (provider === "telegram") {
      const botToken = String(cfg.botToken ?? "").trim();
      if (!botToken) return NextResponse.json({ ok: false, error: "telegram.botToken is required" }, { status: 400 });
    }

    await gatewayConfigPatch({ channels: { [provider]: cfg } }, `ClawKitchen Channels upsert: ${provider}`);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

type DeleteBody = { provider: string };

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as DeleteBody;
    const provider = String(body?.provider ?? "").trim();
    if (!provider) return NextResponse.json({ ok: false, error: "provider is required" }, { status: 400 });

    // Patch semantics: setting a provider to null removes/clears it in the gateway config patcher.
    await gatewayConfigPatch({ channels: { [provider]: null } }, `ClawKitchen Channels delete: ${provider}`);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
