export type TicketComment = {
  timestamp: string;
  authorName: string;
  authorRole?: string;
  authorRaw: string;
  body: string;
};

function findCommentsSection(md: string): { start: number; end: number } | null {
  const headerRe = /^## Comments\s*$/gim;
  const m = headerRe.exec(md);
  if (!m) return null;

  const start = m.index + m[0].length;

  // Find next heading of same or higher level.
  const rest = md.slice(start);
  const nextHeading = rest.search(/^##\s+/m);
  const end = nextHeading === -1 ? md.length : start + nextHeading;
  return { start, end };
}

const ROLE_HINTS = new Set(["lead", "dev", "qa", "tester", "agent", "system"]);

function parseAuthor(rawAuthor: string): { name: string; role?: string; raw: string } {
  const raw = rawAuthor?.trim() || "";
  const normalized = raw || "unknown";

  // Pattern: "RJ (lead)"
  const paren = normalized.match(/^(.*?)\s*\((.*?)\)\s*$/);
  if (paren) {
    const name = paren[1].trim() || "unknown";
    const role = paren[2].trim();
    return { name, role: role && role.toLowerCase() != name.toLowerCase() ? role : undefined, raw: normalized };
  }

  // Pattern: "lead — RJ" / "RJ — lead" / "lead | RJ" / "RJ | lead"
  for (const sep of [" — ", " - ", " | "] as const) {
    if (!normalized.includes(sep)) continue;
    const [a, b] = normalized.split(sep).map((s) => s.trim()).filter(Boolean);
    if (!a || !b) break;

    const aIsRole = ROLE_HINTS.has(a.toLowerCase());
    const bIsRole = ROLE_HINTS.has(b.toLowerCase());

    if (aIsRole && !bIsRole) return { name: b, role: a, raw: normalized };
    if (bIsRole && !aIsRole) return { name: a, role: b, raw: normalized };

    // Otherwise, treat the left as the primary author label and right as secondary detail.
    return { name: a, role: b, raw: normalized };
  }

  return { name: normalized, raw: normalized };
}

export function parseTicketComments(md: string): TicketComment[] {
  const section = findCommentsSection(md);
  if (!section) return [];

  const body = md.slice(section.start, section.end).replace(/^\s+/, "");
  const lines = body.split("\n");

  const out: TicketComment[] = [];
  let current: TicketComment | null = null;

  const header = /^- \*\*(.+?)\*\*\s+—\s+(.*)$/;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const m = line.match(header);
    if (m) {
      if (current) out.push({ ...current, body: current.body.trimEnd() });
      const timestamp = m[1].trim();
      const rest = m[2].trim();
      // Support either "author: first line" or just "author".
      const colonIdx = rest.indexOf(":");
      const authorRaw = (colonIdx >= 0 ? rest.slice(0, colonIdx) : rest).trim() || "unknown";
      const firstBody = colonIdx >= 0 ? rest.slice(colonIdx + 1).trimStart() : "";
      const author = parseAuthor(authorRaw);
      current = {
        timestamp,
        authorName: author.name,
        authorRole: author.role,
        authorRaw: author.raw,
        body: firstBody ? firstBody + "\n" : "",
      };
      continue;
    }

    if (!current) continue;

    // Allow list paragraph indentation, but keep it simple.
    current.body += line.replace(/^\s{0,2}/, "") + "\n";
  }

  if (current) out.push({ ...current, body: current.body.trimEnd() });
  return out;
}

export function formatTicketCommentMarkdown(args: { timestamp: string; author: string; body: string }): string {
  const body = args.body.trim().replace(/\r\n/g, "\n");
  const indented = body
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");

  const author = args.author?.trim() || "unknown";
  return `\n- **${args.timestamp}** — ${author}:\n${indented}\n`;
}
