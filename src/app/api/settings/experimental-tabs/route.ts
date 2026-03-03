import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { getKitchenApi } from "@/lib/kitchen-api";

export async function GET() {
  try {
    const api = getKitchenApi();
    const cfg = (api.config && typeof api.config === "object" ? (api.config as Record<string, unknown>) : {}) as Record<
      string,
      unknown
    >;
    const showExperimentalTabs = cfg.showExperimentalTabs === true;
    return NextResponse.json({ ok: true, showExperimentalTabs });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
