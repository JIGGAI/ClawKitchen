import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { listRunGraphs, resolveTeamIds } from "@/lib/workflows/overview";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  let teamIds: string[];
  try {
    teamIds = await resolveTeamIds(url.searchParams.get("team"));
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 400 });
  }

  try {
    const { runs, total } = await listRunGraphs({ teamIds, limit: parseLimit(url.searchParams.get("limit")) });
    return NextResponse.json({ ok: true, runs, total });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
