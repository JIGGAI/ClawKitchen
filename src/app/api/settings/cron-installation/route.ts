import { NextResponse } from "next/server";
import { gatewayConfigGet, gatewayConfigPatch } from "@/lib/gateway";

const CFG_PATH = "plugins.entries.recipes.config.cronInstallation";

function getPath(obj: unknown, p: string): unknown {
  return p.split(".").reduce<unknown>((acc, k) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[k];
  }, obj);
}

export async function GET() {
  try {
    const { raw } = await gatewayConfigGet();
    const cfg = JSON.parse(raw);
    const value = String(getPath(cfg, CFG_PATH) ?? "").trim();
    return NextResponse.json({ ok: true, path: CFG_PATH, value });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { value?: string };
    const value = String(body.value ?? "").trim();
    if (!value || !["off", "prompt", "on"].includes(value)) {
      return NextResponse.json({ ok: false, error: "value must be one of: off|prompt|on" }, { status: 400 });
    }

    await gatewayConfigPatch(
      {
        plugins: {
          entries: {
            recipes: {
              config: {
                cronInstallation: value,
              },
            },
          },
        },
      },
      `ClawKitchen: set ${CFG_PATH}=${value}`
    );

    return NextResponse.json({ ok: true, path: CFG_PATH, value, note: "Gateway will restart to apply config." });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
