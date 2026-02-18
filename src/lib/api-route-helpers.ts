import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { readOpenClawConfig, teamDirFromBaseWorkspace } from "@/lib/paths";

export type TeamContext = { teamId: string; teamDir: string };

async function resolveTeamContext(teamId: string): Promise<TeamContext | NextResponse> {
  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });

  const cfg = await readOpenClawConfig();
  const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
  if (!baseWorkspace) {
    return NextResponse.json({ ok: false, error: "agents.defaults.workspace not set" }, { status: 500 });
  }

  const teamDir = teamDirFromBaseWorkspace(baseWorkspace, teamId);
  return { teamId, teamDir };
}

/** Resolves teamId and teamDir from URL search params. Returns error response if invalid. */
export async function getTeamContextFromQuery(req: Request): Promise<TeamContext | NextResponse> {
  const { searchParams } = new URL(req.url);
  const teamId = String(searchParams.get("teamId") ?? "").trim();
  return resolveTeamContext(teamId);
}

/** Resolves teamId and teamDir from parsed body. Caller must parse req.json() first. */
export async function getTeamContextFromBody(body: { teamId?: string }): Promise<TeamContext | NextResponse> {
  const teamId = String(body.teamId ?? "").trim();
  return resolveTeamContext(teamId);
}

export type FileCandidate = { name: string; required: boolean; rationale: string };

/** Lists workspace files with presence/size info. */
export async function listWorkspaceFiles(
  baseDir: string,
  candidates: FileCandidate[]
): Promise<
  Array<{
    name: string;
    required: boolean;
    rationale: string;
    path: string;
    missing: boolean;
    size?: number;
    updatedAtMs?: number;
  }>
> {
  return Promise.all(
    candidates.map(async (c) => {
      const p = path.join(baseDir, c.name);
      try {
        const st = await fs.stat(p);
        return {
          name: c.name,
          required: c.required,
          rationale: c.rationale,
          path: p,
          missing: false,
          size: st.size,
          updatedAtMs: st.mtimeMs,
        };
      } catch {
        return { name: c.name, required: c.required, rationale: c.rationale, path: p, missing: true };
      }
    })
  );
}
