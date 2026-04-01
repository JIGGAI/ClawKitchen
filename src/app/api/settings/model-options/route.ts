import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { readOpenClawConfigRaw } from "@/lib/openclaw-config";
import { isRecord } from "@/lib/type-guards";

export async function GET() {
  try {
    const cfg = await readOpenClawConfigRaw();
    const root = isRecord(cfg.json) ? cfg.json : {};
    const agents = isRecord(root.agents) ? root.agents : {};
    const defaults = isRecord(agents.defaults) ? agents.defaults : {};
    const model = isRecord(defaults.model) ? defaults.model : {};

    const primary = typeof model.primary === "string" ? model.primary.trim() : "";
    const fallbacks = Array.isArray(model.fallbacks)
      ? model.fallbacks.map((m) => String(m ?? "").trim()).filter(Boolean)
      : [];

    const models = Array.from(new Set([primary, ...fallbacks].filter(Boolean)));
    return NextResponse.json({ ok: true, models });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
