import { NextResponse } from "next/server";
import { listLocalTeamIds } from "@/lib/teams";
import { readManifest } from "@/lib/manifest";

export async function GET() {
  try {
    // Fast path: read from manifest
    const manifest = await readManifest();
    if (manifest) {
      const teamIds = Object.keys(manifest.teams).sort();
      return NextResponse.json({ ok: true, teamIds });
    }

    // Fallback: filesystem scan
    const teamIds = await listLocalTeamIds();
    return NextResponse.json({ ok: true, teamIds });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
