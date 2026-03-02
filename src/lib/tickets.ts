import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type TicketStage = "backlog" | "in-progress" | "testing" | "done";

export interface TicketSummary {
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
 * Back-compat for older non-team-scoped routes.
 * Prefer passing explicit teamId into APIs instead.
 */
export function getTeamWorkspaceDir(): string {
  return process.env.CK_TEAM_WORKSPACE_DIR ?? teamWorkspace("development-team");
}

export function stageDir(stage: TicketStage, teamOrDir: string = "development-team") {
  const map: Record<TicketStage, string> = {
    backlog: "work/backlog",
    "in-progress": "work/in-progress",
    testing: "work/testing",
    done: "work/done",
  };

  const base = isPathLike(teamOrDir) ? teamOrDir : teamWorkspace(teamOrDir);
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

/**
 * List tickets.
 * - Preferred: listTickets("development-team")
 * - Back-compat: listTickets(getTeamWorkspaceDir())
 */
export async function listTickets(teamIdOrDir: string = "development-team"): Promise<TicketSummary[]> {
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
 * Back-compat helper used by some API routes.
 */
export async function getTicketByIdOrNumber(
  ticketIdOrNumber: string,
  teamIdOrDir: string = "development-team",
): Promise<TicketSummary | null> {
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
 * getTicketMarkdown(teamId, ticketIdOrNumber) OR getTicketMarkdown(ticketIdOrNumber, teamDir)
 */
export async function getTicketMarkdown(
  a: string,
  b: string,
): Promise<{ id: string; file: string; markdown: string; owner: string | null; stage: TicketStage } | null> {
  // Detect call signature.
  const ticketIdOrNumber = isPathLike(b) ? a : b;
  const teamIdOrDir = isPathLike(b) ? b : a;

  const hit = await getTicketByIdOrNumber(ticketIdOrNumber, teamIdOrDir);
  if (!hit) return null;

  return {
    id: hit.id,
    file: hit.file,
    markdown: await fs.readFile(hit.file, "utf8"),
    owner: hit.owner,
    stage: hit.stage,
  };
}
