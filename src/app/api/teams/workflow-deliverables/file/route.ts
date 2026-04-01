import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import { getTeamWorkspaceDir } from "@/lib/paths";

/**
 * Serve a workflow deliverable file by teamId + runId + relative path.
 * Only serves files that live inside the team's workflow-runs directory (path traversal safe).
 */

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "text/typescript",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId")?.trim();
  const runId = url.searchParams.get("runId")?.trim();
  const filePath = url.searchParams.get("path")?.trim();

  if (!teamId || !runId || !filePath) {
    return NextResponse.json(
      { ok: false, error: "teamId, runId, and path are required" },
      { status: 400 },
    );
  }

  try {
    const teamDir = await getTeamWorkspaceDir(teamId);
    const runsDir = path.join(teamDir, "shared-context", "workflow-runs");

    // Resolve to absolute and ensure it stays within the runs directory (prevent traversal)
    const resolved = path.resolve(runsDir, runId, filePath);
    if (!resolved.startsWith(runsDir + path.sep)) {
      return NextResponse.json(
        { ok: false, error: "Invalid path" },
        { status: 403 },
      );
    }

    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return NextResponse.json(
        { ok: false, error: "Not a file" },
        { status: 404 },
      );
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";
    const data = await fs.readFile(resolved);

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("ENOENT") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
