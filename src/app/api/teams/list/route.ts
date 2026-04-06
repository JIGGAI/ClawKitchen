import { NextResponse } from "next/server";
import { listLocalTeamIds } from "@/lib/teams";

export async function GET() {
  try {
    const teamIds = await listLocalTeamIds();
    return NextResponse.json({ ok: true, teamIds });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
