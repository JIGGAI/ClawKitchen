import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { getWorkspaceGoalsDir } from "@/lib/paths";

export type GoalStatus = "planned" | "active" | "done";

/** Parses comma-separated string into trimmed non-empty array. */
export function parseCommaList(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export type GoalFrontmatter = {
  id: string;
  title: string;
  status: GoalStatus;
  tags: string[];
  teams: string[];
  updatedAt: string; // ISO
};

export type GoalSummary = GoalFrontmatter & {
  filename: string;
};

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function assertSafeGoalId(id: string) {
  if (!ID_RE.test(id)) {
    throw new Error(
      `Invalid goal id "${id}". Use 2-64 chars: lowercase letters, numbers, hyphens. Example: "increase-trial-activation".`
    );
  }
}

/** Maps goal-related errors to HTTP status: 400 for validation, 500 for other. */
export function goalErrorStatus(msg: string): 400 | 500 {
  return /Invalid goal id|Path traversal/.test(msg) ? 400 : 500;
}

export function splitFrontmatter(md: string): { fm: unknown; body: string } {
  if (md.startsWith("---\n")) {
    const end = md.indexOf("\n---\n", 4);
    if (end !== -1) {
      const yamlText = md.slice(4, end + 1);
      const body = md.slice(end + 5);
      const fm = YAML.parse(yamlText) as unknown;
      return { fm: fm ?? {}, body };
    }
  }
  return { fm: {}, body: md };
}

export function normalizeFrontmatter(input: unknown, fallbackId: string, fallbackTitle: string): GoalFrontmatter {
  const now = new Date().toISOString();
  const obj = (input && typeof input === "object") ? (input as Record<string, unknown>) : {};
  const id = String(obj.id ?? fallbackId).trim();
  const title = String(obj.title ?? fallbackTitle ?? id).trim() || id;
  const statusRaw = String(obj.status ?? "planned").trim();
  const status: GoalStatus = statusRaw === "active" || statusRaw === "done" ? statusRaw : "planned";
  const tags = Array.isArray(obj.tags) ? (obj.tags as unknown[]).map(String) : [];
  const teams = Array.isArray(obj.teams) ? (obj.teams as unknown[]).map(String) : [];
  const updatedAt = String(obj.updatedAt ?? now);

  return { id, title, status, tags, teams, updatedAt };
}

async function ensureGoalsDir() {
  const dir = await getWorkspaceGoalsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function goalPathForId(id: string) {
  assertSafeGoalId(id);
  const root = await ensureGoalsDir();
  const full = path.join(root, `${id}.md`);
  const normalizedRoot = path.resolve(root) + path.sep;
  const normalizedFull = path.resolve(full);
  if (!normalizedFull.startsWith(normalizedRoot)) throw new Error("Path traversal rejected");
  return { root, full };
}

export async function listGoals(): Promise<GoalSummary[]> {
  const dir = await ensureGoalsDir();
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));

  const out: GoalSummary[] = [];
  for (const f of files) {
    const full = path.join(dir, f);
    const md = await fs.readFile(full, "utf8");
    const id = f.replace(/\.md$/, "");
    const { fm } = splitFrontmatter(md);
    const normalized = normalizeFrontmatter(fm, id, id);
    out.push({ ...normalized, filename: f });
  }

  // sort: active first, then planned, then done; within status by updatedAt desc
  const rank: Record<GoalStatus, number> = { active: 0, planned: 1, done: 2 };
  out.sort((a, b) => {
    const ra = rank[a.status];
    const rb = rank[b.status];
    if (ra !== rb) return ra - rb;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });

  return out;
}

export async function readGoal(id: string): Promise<{ frontmatter: GoalFrontmatter; body: string; raw: string } | null> {
  const { full } = await goalPathForId(id);
  try {
    const raw = await fs.readFile(full, "utf8");
    const { fm, body } = splitFrontmatter(raw);
    const fmObj = (fm && typeof fm === "object") ? (fm as Record<string, unknown>) : {};
    const frontmatter = normalizeFrontmatter(fm, id, String(fmObj.title ?? id));
    return { frontmatter, body, raw };
  } catch (e: unknown) {
    if (typeof e === "object" && e && (e as { code?: string }).code === "ENOENT") return null;
    throw e;
  }
}

export async function writeGoal(params: {
  id: string;
  title: string;
  status?: GoalStatus;
  tags?: string[];
  teams?: string[];
  body: string;
}): Promise<{ frontmatter: GoalFrontmatter; raw: string }>
{
  const { id } = params;
  const { full } = await goalPathForId(id);

  const updatedAt = new Date().toISOString();
  const fm: GoalFrontmatter = {
    id,
    title: params.title,
    status: params.status ?? "planned",
    tags: params.tags ?? [],
    teams: params.teams ?? [],
    updatedAt,
  };

  const raw = `---\n${YAML.stringify(fm).trim()}\n---\n\n${(params.body ?? "").trim()}\n`;
  await fs.writeFile(full, raw, "utf8");
  return { frontmatter: fm, raw };
}

export async function deleteGoal(id: string): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const { full } = await goalPathForId(id);
  try {
    await fs.unlink(full);
    return { ok: true };
  } catch (e: unknown) {
    if (typeof e === "object" && e && (e as { code?: string }).code === "ENOENT") {
      return { ok: false, reason: "not_found" };
    }
    throw e;
  }
}
