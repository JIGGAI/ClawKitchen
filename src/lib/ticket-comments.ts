export type TicketComment = {
  timestamp: string;
  author: string;
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
      const author = (colonIdx >= 0 ? rest.slice(0, colonIdx) : rest).trim() || "unknown";
      const firstBody = colonIdx >= 0 ? rest.slice(colonIdx + 1).trimStart() : "";
      current = { timestamp, author, body: firstBody ? firstBody + "\n" : "" };
      continue;
    }

    if (!current) continue;

    // Allow list paragraph indentation, but keep it simple.
    current.body += line.replace(/^\s{0,2}/, "") + "\n";
  }

  if (current) out.push({ ...current, body: current.body.trimEnd() });
  return out;
}

export function formatTicketCommentMarkdown(args: {
  timestamp: string;
  author: string;
  body: string;
}): string {
  const body = args.body.trim().replace(/\r\n/g, "\n");
  const indented = body
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");

  const author = args.author?.trim() || "unknown";
  return `\n- **${args.timestamp}** — ${author}:\n${indented}\n`;
}
