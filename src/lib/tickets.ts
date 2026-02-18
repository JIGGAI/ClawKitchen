import fs from "node:fs/promises";
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

const TEAM_WORKSPACE = "/home/control/.openclaw/workspace-development-team";

export function stageDir(stage: TicketStage) {
  const map: Record<TicketStage, string> = {
    backlog: "work/backlog",
    "in-progress": "work/in-progress",
    testing: "work/testing",
    done: "work/done",
  };
  return path.join(TEAM_WORKSPACE, map[stage]);
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
  const re = new RegExp(`^${field}:\s*(.*)$`, "mi");
  const m = md.match(re);
  return m?.[1]?.trim() || null;
}

export function parseNumberFromFilename(filename: string): number | null {
  const m = filename.match(/^(\d{4})-/);
  if (!m) return null;
  return Number(m[1]);
}

export async function listTickets(): Promise<TicketSummary[]> {
  const stages: TicketStage[] = ["backlog", "in-progress", "testing", "done"];
  const all: TicketSummary[] = [];

  for (const stage of stages) {
    let files: string[] = [];
    try {
      files = await fs.readdir(stageDir(stage));
    } catch {
      files = [];
    }

    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      const number = parseNumberFromFilename(f);
      if (number == null) continue;

      const file = path.join(stageDir(stage), f);
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

export async function getTicketMarkdown(ticketIdOrNumber: string): Promise<{ id: string; file: string; markdown: string } | null> {
  const tickets = await listTickets();
  const normalized = ticketIdOrNumber.trim();

  const byNumber = normalized.match(/^\d+$/)
    ? tickets.find((t) => t.number === Number(normalized))
    : null;

  const byId = tickets.find((t) => t.id === normalized);

  const hit = byId ?? byNumber;
  if (!hit) return null;

  return {
    id: hit.id,
    file: hit.file,
    markdown: await fs.readFile(hit.file, "utf8"),
  };
}
