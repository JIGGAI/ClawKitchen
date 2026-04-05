import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { withTeamContextFromQuery } from "@/lib/api-route-helpers";
import { errorMessage } from "@/lib/errors";

/* ---------- types ---------- */

type MemoryItem = {
  ts: string;
  author: string;
  type: string;
  content: string;
  source?: unknown;
  _file?: string;
  _line?: number;
  _parseError?: string;
};

type MemoryPointer = {
  file: string;
  line: number;
};

type PinnedOp =
  | {
      op: "pin";
      ts: string;
      actor: string;
      key: MemoryPointer;
      item: BaseMemoryItem;
    }
  | {
      op: "unpin";
      ts: string;
      actor: string;
      key: MemoryPointer;
    };

type MemoryFileInfo = {
  name: string;
  kind: "jsonl" | "md" | "other";
  sizeBytes: number;
  modifiedAt: string;
};

type MarkdownFile = {
  name: string;
  content: string;
  sizeBytes: number;
  modifiedAt: string;
};

type BaseMemoryItem = Omit<MemoryItem, "_file" | "_line" | "_parseError">;
type BaseMemoryItemOrNull = BaseMemoryItem | null;

const TEAM_FILE = "team.jsonl" as const;
const PINNED_FILE = "pinned.jsonl" as const;

/* ---------- helpers ---------- */

function safeParseJsonLine(line: string): { parsed: unknown; error?: string } {
  const t = line.trim();
  if (!t) return { parsed: null };
  try {
    return { parsed: JSON.parse(t) };
  } catch (e: unknown) {
    return { parsed: null, error: `Invalid JSON: ${String((e as Error)?.message ?? e)}` };
  }
}

function asMemoryItem(x: unknown): BaseMemoryItemOrNull {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const ts = String(o.ts ?? "").trim();
  const author = String(o.author ?? "").trim();
  const type = String(o.type ?? "").trim();
  const content = String(o.content ?? "").trim();
  // For non-team JSONL files, be lenient: only require ts or content
  if (!ts && !content) return null;
  const source = o.source;
  return {
    ts: ts || new Date().toISOString(),
    author: author || "unknown",
    type: type || "entry",
    content: content || JSON.stringify(o),
    source,
  };
}

function asPointer(x: unknown): MemoryPointer | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const file = String(o.file ?? "").trim();
  const line = Number(o.line);
  if (!file.endsWith(".jsonl")) return null;
  if (!Number.isFinite(line) || line <= 0) return null;
  return { file, line: Math.floor(line) };
}

function asPinnedOp(x: unknown): PinnedOp | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const op = String(o.op ?? "").trim();
  const ts = String(o.ts ?? "").trim();
  const actor = String(o.actor ?? "").trim();
  const key = asPointer(o.key);

  if (!op || !ts || !actor || !key) return null;

  if (op === "pin") {
    const item = asMemoryItem(o.item);
    if (!item) return null;
    return { op: "pin", ts, actor, key, item };
  }

  if (op === "unpin") {
    return { op: "unpin", ts, actor, key };
  }

  return null;
}

async function readJsonlFile(full: string): Promise<string[]> {
  try {
    const text = await fs.readFile(full, "utf8");
    return text.split(/\r?\n/);
  } catch {
    return [];
  }
}

async function readMarkdownFile(full: string): Promise<string> {
  try {
    return await fs.readFile(full, "utf8");
  } catch {
    return "";
  }
}

async function scanMemoryDir(memoryDir: string): Promise<MemoryFileInfo[]> {
  try {
    const entries = await fs.readdir(memoryDir);
    const results: MemoryFileInfo[] = [];
    for (const name of entries) {
      try {
        const stat = await fs.stat(path.join(memoryDir, name));
        if (!stat.isFile()) continue;
        const ext = path.extname(name).toLowerCase();
        const kind: MemoryFileInfo["kind"] = ext === ".jsonl" ? "jsonl" : ext === ".md" ? "md" : "other";
        results.push({
          name,
          kind,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        // skip unreadable files
      }
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  } catch {
    return [];
  }
}

function parseJsonlItems(lines: string[], fileName: string): MemoryItem[] {
  const items: MemoryItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line) continue;
    const { parsed, error } = safeParseJsonLine(line);
    if (error) {
      // Surface broken lines with error indicator
      items.push({
        ts: new Date().toISOString(),
        author: "system",
        type: "parse-error",
        content: line.slice(0, 500),
        _file: fileName,
        _line: i + 1,
        _parseError: error,
      });
      continue;
    }
    const item = asMemoryItem(parsed);
    if (!item) {
      // Valid JSON but not a recognized memory item — show raw content
      if (parsed && typeof parsed === "object") {
        items.push({
          ts: String((parsed as Record<string, unknown>).ts ?? new Date().toISOString()),
          author: String((parsed as Record<string, unknown>).author ?? "unknown"),
          type: String((parsed as Record<string, unknown>).type ?? "entry"),
          content: JSON.stringify(parsed),
          _file: fileName,
          _line: i + 1,
        });
      }
      continue;
    }
    items.push({ ...item, _file: fileName, _line: i + 1 });
  }
  return items;
}

/* ---------- GET ---------- */

export async function GET(req: Request) {
  return withTeamContextFromQuery(req, async ({ teamId, teamDir }) => {
    try {
      const memoryDir = path.join(teamDir, "shared-context", "memory");

      // Phase 1: Scan all files in memory directory
      const fileList = await scanMemoryDir(memoryDir);

      // Load ALL jsonl files (not just team.jsonl)
      const allJsonlItems: MemoryItem[] = [];
      const jsonlFiles = fileList.filter((f) => f.kind === "jsonl");
      for (const f of jsonlFiles) {
        const lines = await readJsonlFile(path.join(memoryDir, f.name));
        const items = parseJsonlItems(lines, f.name);
        allJsonlItems.push(...items);
      }

      // Load pinned operations and compute active pinned set.
      const pinnedFull = path.join(memoryDir, PINNED_FILE);
      const pinnedLines = await readJsonlFile(pinnedFull);
      const pinnedByKey = new Map<
        string,
        {
          key: MemoryPointer;
          item: BaseMemoryItem;
          pinnedAt: string;
          pinnedBy: string;
        }
      >();

      for (const line of pinnedLines) {
        const { parsed } = safeParseJsonLine(line);
        const op = asPinnedOp(parsed);
        if (!op) continue;
        const k = `${op.key.file}:${op.key.line}`;
        if (op.op === "pin") {
          pinnedByKey.set(k, { key: op.key, item: op.item, pinnedAt: op.ts, pinnedBy: op.actor });
        } else {
          pinnedByKey.delete(k);
        }
      }

      const pinnedItems = Array.from(pinnedByKey.values()).map(({ key, item, pinnedAt, pinnedBy }) => ({
        ...item,
        _file: key.file,
        _line: key.line,
        pinnedAt,
        pinnedBy,
        _key: `${key.file}:${key.line}`,
      }));

      // Sort pinned by pinnedAt desc (then item.ts desc).
      pinnedItems.sort(
        (a, b) => String(b.pinnedAt).localeCompare(String(a.pinnedAt)) || String(b.ts).localeCompare(String(a.ts))
      );

      // Recent: exclude pinned keys and show most recent first.
      const pinnedKeys = new Set(pinnedItems.map((x) => x._key));
      const recentItems = allJsonlItems
        .filter((x) => !pinnedKeys.has(`${x._file ?? ""}:${x._line ?? 0}`))
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
        .slice(0, 200);

      // Load markdown files
      const mdFiles = fileList.filter((f) => f.kind === "md");
      const markdownFiles: MarkdownFile[] = [];
      for (const f of mdFiles) {
        const content = await readMarkdownFile(path.join(memoryDir, f.name));
        markdownFiles.push({
          name: f.name,
          content,
          sizeBytes: f.sizeBytes,
          modifiedAt: f.modifiedAt,
        });
      }

      return NextResponse.json({
        ok: true,
        teamId,
        memoryDir,
        files: fileList,
        markdownFiles,
        pinnedItems,
        items: recentItems,
      });
    } catch (e: unknown) {
      return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
    }
  });
}

/* ---------- POST ---------- */

export async function POST(req: Request) {
  return withTeamContextFromQuery(req, async ({ teamId, teamDir }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const op = String(o.op ?? "append").trim() || "append";
    const actor = String(o.actor ?? "").trim() || `${teamId}-lead`;

    try {
      const memoryDir = path.join(teamDir, "shared-context", "memory");
      await fs.mkdir(memoryDir, { recursive: true });

      // Append to any .jsonl file in the memory directory.
      if (op === "append") {
        const ts = String(o.ts ?? "").trim();
        const author = String(o.author ?? "").trim();
        const type = String(o.type ?? "").trim();
        const content = String(o.content ?? "").trim();
        const source = o.source;

        if (!ts || !author || !type || !content) {
          return NextResponse.json(
            { ok: false, error: "ts, author, type, and content are required" },
            { status: 400 }
          );
        }

        // Allow appending to any .jsonl file (safety: must be .jsonl, no path traversal)
        const file = String(o.file ?? TEAM_FILE).trim() || TEAM_FILE;
        if (!file.endsWith(".jsonl") || file.includes("/") || file.includes("\\") || file === PINNED_FILE) {
          return NextResponse.json({ ok: false, error: "Invalid file target" }, { status: 400 });
        }

        const full = path.join(memoryDir, file);
        const item: BaseMemoryItem = {
          ts,
          author,
          type,
          content,
          ...(source !== undefined ? { source } : {}),
        };
        await fs.appendFile(full, JSON.stringify(item) + "\n", "utf8");
        return NextResponse.json({ ok: true, teamId, file, item });
      }

      // Save markdown file content
      if (op === "save-md") {
        const fileName = String(o.file ?? "").trim();
        const content = String(o.content ?? "");

        if (!fileName || !fileName.endsWith(".md") || fileName.includes("/") || fileName.includes("\\")) {
          return NextResponse.json({ ok: false, error: "Invalid markdown file name" }, { status: 400 });
        }

        const full = path.join(memoryDir, fileName);
        await fs.writeFile(full, content, "utf8");
        return NextResponse.json({ ok: true, teamId, file: fileName, op: "save-md" });
      }

      // Delete a memory item from a .jsonl file (rewrite without the line)
      if (op === "delete") {
        const file = String(o.file ?? "").trim();
        const line = Number(o.line);

        if (!file.endsWith(".jsonl") || file.includes("/") || file.includes("\\") || file === PINNED_FILE) {
          return NextResponse.json({ ok: false, error: "Invalid file" }, { status: 400 });
        }
        if (!Number.isFinite(line) || line < 1) {
          return NextResponse.json({ ok: false, error: "Invalid line number" }, { status: 400 });
        }

        const full = path.join(memoryDir, file);
        const lines = await readJsonlFile(full);
        // Remove the line (1-indexed)
        const idx = Math.floor(line) - 1;
        if (idx < 0 || idx >= lines.length) {
          return NextResponse.json({ ok: false, error: "Line out of range" }, { status: 400 });
        }
        lines.splice(idx, 1);
        await fs.writeFile(full, lines.join("\n"), "utf8");
        return NextResponse.json({ ok: true, teamId, file, op: "delete", deletedLine: line });
      }

      // Pin/unpin operations: append-only ops into pinned.jsonl.
      if (op === "pin" || op === "unpin") {
        const ts = String(o.ts ?? new Date().toISOString()).trim();
        const key = asPointer(o.key);
        if (!key) {
          return NextResponse.json({ ok: false, error: "Invalid key" }, { status: 400 });
        }

        if (op === "pin") {
          const item = asMemoryItem(o.item);
          if (!item) {
            return NextResponse.json({ ok: false, error: "Invalid item" }, { status: 400 });
          }

          const record: PinnedOp = { op: "pin", ts, actor, key, item };
          const full = path.join(memoryDir, PINNED_FILE);
          await fs.appendFile(full, JSON.stringify(record) + "\n", "utf8");
          return NextResponse.json({ ok: true, teamId, op: "pin", key });
        }

        const record: PinnedOp = { op: "unpin", ts, actor, key };
        const full = path.join(memoryDir, PINNED_FILE);
        await fs.appendFile(full, JSON.stringify(record) + "\n", "utf8");
        return NextResponse.json({ ok: true, teamId, op: "unpin", key });
      }

      return NextResponse.json({ ok: false, error: `Unknown op: ${op}` }, { status: 400 });
    } catch (e: unknown) {
      return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
    }
  });
}
