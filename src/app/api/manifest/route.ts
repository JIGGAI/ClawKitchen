import { NextResponse } from "next/server";
import { readManifest, isManifestStale, triggerManifestRegeneration } from "@/lib/manifest";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const manifest = await readManifest();

    if (!manifest) {
      // Manifest missing — trigger generation and return empty shell
      triggerManifestRegeneration();
      return NextResponse.json({ ok: false, error: "Manifest not yet generated" }, { status: 503 });
    }

    // If stale, serve it but trigger background regen
    if (isManifestStale(manifest)) {
      triggerManifestRegeneration();
    }

    return NextResponse.json(manifest);
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
