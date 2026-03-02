import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type TicketStage = "backlog" | "in-progress" | "testing" | "done";

export interface TicketSummary {
  teamId: string;
  number: number;
  id: string;
  title: string;
  owner: string | null;
  stage: TicketStage;
  file: string;
  updatedAt: string; // ISO
  ageHours: number;
}

function assertSafeTeamId(teamId: string) {
  // Conservative: matches OpenClaw team ids like "development-team".
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(teamId)) {
    throw new Error(`Invalid teamId "${teamId}"`);
  }
}

function isPathLike(s: string) {
  return s.includes("/") || s.includes("\\");
}

export function teamWorkspace(teamId: string) {
  assertSafeTeamId(teamId);
  return path.join(os.homedir(), ".openclaw", `workspace-${teamId}`);
}

/**
 * Back-compat helper for older non-team-scoped code paths.
 * Prefer passing explicit teamId into APIs instead.
 */
export function getTeamWorkspaceDir(teamId?: string): string {
  if (teamId) return teamWorkspace(teamId);
  return process.env.CK_TEAM_WORKSPACE_DIR ?? teamWorkspace(process.env.CK_TEAM_ID ?? "development-team");
}

export function stageDir(stage: TicketStage, teamIdOrDir: string = "development-team") {
  const map: Record<TicketStage, string> = {
    backlog: "work/backlog",
    "in-progress": "work/in-progress",
    testing: "work/testing",
    done: "work/done",
  };

  const base = isPathLike(teamIdOrDir) ? teamIdOrDir : teamWorkspace(teamIdOrDir);
  return path.join(base, map[stage]);
}

export function parseTitle(md: string) {
  // Ticket markdown files typically start with: # 0033-some-slug
  const firstLine = md.split("\n")[0] ?? "";
  const header = firstLine.startsWith("# ") ? firstLine.slice(2).trim() : "";

  // If header is like: "<id> <title...>" keep the explicit title portion.
  const firstSpace = header.indexOf(" ");
  if (firstSpace > 0) {
    const afterSpace = header.slice(firstSpace + 1).trim();
    if (afterSpace) return afterSpace;
  }

  // Otherwise derive from the slug: strip leading number + hyphen, then de-kebab.
  const derivedRaw = header
    .replace(/^\d{4}-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const ACRONYMS = new Set(["api", "cli", "ui", "ux", "gpu", "cpu", "npm", "pr", "ci", "cd", "json", "yaml", "md"]);
  const titleCase = (s: string) =>
    s
      .split(" ")
      .filter(Boolean)
      .map((w) => {
        const lower = w.toLowerCase();
        if (ACRONYMS.has(lower)) return w.toUpperCase();
        if (lower.startsWith("v") && /^\d/.test(lower.slice(1))) return w; // version-like
        if (/^[\d.]+$/.test(w)) return w; // numbers/semver
        return w.slice(0, 1).toUpperCase() + w.slice(1);
      })
      .join(" ");

  const derived = derivedRaw ? titleCase(derivedRaw) : "";

  if (derived) return derived;
  return header || "(untitled)";
}

function parseField(md: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*(.*)$`, "mi");
  const m = md.match(re);
  return m?.[1]?.trim() || null;
}

export function parseNumberFromFilename(filename: string): number | null {
  const m = filename.match(/^(\d{4})-/);
  if (!m) return null;
  return Number(m[1]);
}

function teamIdFromTeamDir(teamDir: string): string {
  const base = path.basename(teamDir);
  if (base.startsWith("workspace-")) return base.slice("workspace-".length);
  return base;
}

export async function discoverTeamIds(): Promise<string[]> {
  // Convention: ~/.openclaw/workspace-<teamId>
  const root = path.join(os.homedir(), ".openclaw");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.startsWith("workspace-"))
    .map((e) => e.slice("workspace-".length))
    .filter((id) => Boolean(id) && id !== "workspace")
    .sort();
}

/**
 * List tickets for a specific team (recommended).
 * - listTickets("development-team")
 * - listTickets(teamWorkspaceDir)
 */
export async function listTickets(teamIdOrDir: string = "development-team"): Promise<TicketSummary[]> {
  const teamId = isPathLike(teamIdOrDir) ? teamIdFromTeamDir(teamIdOrDir) : teamIdOrDir;
  const stages: TicketStage[] = ["backlog", "in-progress", "testing", "done"];
  const all: TicketSummary[] = [];

  for (const stage of stages) {
    let files: string[] = [];
    try {
      files = await fs.readdir(stageDir(stage, teamIdOrDir));
    } catch {
      files = [];
    }

    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      const number = parseNumberFromFilename(f);
      if (number == null) continue;

      const file = path.join(stageDir(stage, teamIdOrDir), f);
      const [md, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);

      const title = parseTitle(md);
      const owner = parseField(md, "Owner");
      const updatedAt = stat.mtime.toISOString();
      const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);

      all.push({
        teamId,
        number,
        id: f.replace(/\.md$/, ""),
        title,
        owner,
        stage,
        file,
        updatedAt,
        ageHours,
      });
    }
  }

  all.sort((a, b) => a.number - b.number);
  return all;
}

/**
 * List tickets across all discovered teams (used for /tickets?team=all).
 */
export async function listAllTeamsTickets(): Promise<TicketSummary[]> {
  const teamIds = await discoverTeamIds();
  const all: TicketSummary[] = [];

  for (const teamId of teamIds) {
    all.push(...(await listTickets(teamId)));
  }

  all.sort((a, b) => (a.teamId === b.teamId ? a.number - b.number : a.teamId.localeCompare(b.teamId)));
  return all;
}

/**
 * Back-compat helper used by some API routes.
 */
export async function getTicketByIdOrNumber(ticketIdOrNumber: string, teamIdOrDir: string = "development-team") {
  const tickets = await listTickets(teamIdOrDir);
  const normalized = ticketIdOrNumber.trim();

  const byNumber = normalized.match(/^\d+$/) ? tickets.find((t) => t.number === Number(normalized)) : null;
  const byId = tickets.find((t) => t.id === normalized);
  return byId ?? byNumber ?? null;
}

export async function resolveTicket(teamId: string, ticketIdOrNumber: string): Promise<TicketSummary | null> {
  return getTicketByIdOrNumber(ticketIdOrNumber, teamId);
}

/**
 * getTicketMarkdown(teamId, ticketIdOrNumber)
 */
export async function getTicketMarkdown(
  teamId: string,
  ticketIdOrNumber: string,
): Promise<{ teamId: string; id: string; file: string; markdown: string; owner: string | null; stage: TicketStage } | null> {
  const hit = await getTicketByIdOrNumber(ticketIdOrNumber, teamId);
  if (!hit) return null;

  return {
    teamId: hit.teamId,
    id: hit.id,
    file: hit.file,
    markdown: await fs.readFile(hit.file, "utf8"),
    owner: hit.owner,
    stage: hit.stage,
  };
}
