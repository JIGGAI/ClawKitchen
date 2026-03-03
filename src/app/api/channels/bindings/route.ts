import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { readOpenClawConfigRaw, redactChannels, patchOpenClawConfigFile } from "@/lib/openclaw-config";
import { isRecord } from "@/lib/type-guards";

export async function GET() {
  try {
    const cfg = await readOpenClawConfigRaw();
    const root = isRecord(cfg.json) ? cfg.json : {};
    const channels = isRecord(root.channels) ? root.channels : {};
    const bindings = Array.isArray(root.bindings) ? root.bindings : [];

    // NOTE: We intentionally avoid calling the Gateway tool (gateway.config.get/patch) here.
    // Kitchen runs in-process with the gateway, but the /tools/invoke surface is sensitive.
    // Instead, we read ~/.openclaw/openclaw.json directly and redact secrets.
    return NextResponse.json({ ok: true, hash: cfg.hash, channels: redactChannels(channels), bindings });
  } catch (e: unknown) {
    const msg = errorMessage(e);
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

    await patchOpenClawConfigFile({
      note: `ClawKitchen Channels upsert: ${provider}`,
      patch: (prev) => {
        const next = { ...prev };
        const prevChannels = isRecord(next.channels) ? (next.channels as Record<string, unknown>) : {};
        next.channels = { ...prevChannels, [provider]: cfg };
        return next;
      },
    });

    return NextResponse.json({ ok: true, restartRequired: true, restartHint: "Restart OpenClaw Gateway to apply channel config changes." });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

type DeleteBody = { provider: string; confirm?: string };

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as DeleteBody;
    const provider = String(body?.provider ?? "").trim();
    if (!provider) return NextResponse.json({ ok: false, error: "provider is required" }, { status: 400 });

    const confirm = String(body?.confirm ?? "").trim();
    if (confirm != provider) {
      return NextResponse.json(
        { ok: false, error: `Typed confirmation required. Set confirm="${provider}" to delete.` },
        { status: 400 }
      );
    }

    await patchOpenClawConfigFile({
      note: `ClawKitchen Channels delete: ${provider}`,
      patch: (prev) => {
        const next = { ...prev };
        const prevChannels = isRecord(next.channels) ? (next.channels as Record<string, unknown>) : {};
        const rest = { ...prevChannels };
        delete (rest as Record<string, unknown>)[provider];
        next.channels = rest;
        return next;
      },
    });

    return NextResponse.json({ ok: true, restartRequired: true, restartHint: "Restart OpenClaw Gateway to apply channel config changes." });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
