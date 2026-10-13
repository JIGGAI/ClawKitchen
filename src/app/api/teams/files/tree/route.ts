import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { withTeamContextFromQuery } from "@/lib/api-route-helpers";
import { listWorkspaceDir, normalizeWorkspaceDir } from "@/lib/workspace-tree";

/**
 * GET /api/teams/files/tree?teamId=…&dir=<workspace-relative path>
 *
 * One directory level of the team workspace, folders first. The Files tab
 * expands folders on demand with this, so every file in the workspace is
 * reachable without shipping a 2,000-entry tree in one response. `.git`,
 * `node_modules` and `.secrets` are never listed and cannot be requested.
 */
export async function GET(req: Request) {
  return withTeamContextFromQuery(req, async ({ teamId, teamDir }) => {
    const { searchParams } = new URL(req.url);
    const dir = normalizeWorkspaceDir(String(searchParams.get("dir") ?? ""));
    if (dir === null) {
      return NextResponse.json({ ok: false, error: "Invalid directory" }, { status: 400 });
    }
    try {
      const entries = await listWorkspaceDir(teamDir, dir);
      return NextResponse.json({ ok: true, teamId, dir, entries });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      const status = code === "ENOENT" || code === "ENOTDIR" ? 404 : 500;
      return NextResponse.json({ ok: false, error: errorMessage(e) }, { status });
    }
  });
}
