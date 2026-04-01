import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { gatewayConfigGet } from "@/lib/gateway";

export async function GET() {
  try {
    const { raw } = await gatewayConfigGet();
    const cfg = JSON.parse(raw) as {
      agents?: { defaults?: { model?: { primary?: unknown; fallbacks?: unknown[] } } };
    };

    const primary = typeof cfg.agents?.defaults?.model?.primary === "string" ? cfg.agents.defaults.model.primary.trim() : "";
    const fallbacks = Array.isArray(cfg.agents?.defaults?.model?.fallbacks)
      ? cfg.agents.defaults.model.fallbacks.map((m) => String(m ?? "").trim()).filter(Boolean)
      : [];

    const models = Array.from(new Set([primary, ...fallbacks].filter(Boolean)));
    return NextResponse.json({ ok: true, models });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
