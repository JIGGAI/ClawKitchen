/** Chat shapes mapped from OpenClaw gateway payloads. Pure — the routes do the I/O. */

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; ts: number | null };

export type ChatThread = {
  key: string;
  title: string;
  preview: string | null;
  updatedAt: number | null;
  running: boolean;
  primary: boolean;
};

export type StreamEvent =
  | { type: "delta"; runId: string | null; text: string }
  | { type: "final"; runId: string | null }
  | { type: "aborted"; runId: string | null }
  | { type: "error"; runId: string | null; message: string };

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/;

export function isAgentId(v: unknown): v is string {
  return typeof v === "string" && ID_RE.test(v);
}

export function mainSessionKey(agentId: string): string {
  return `agent:${agentId}:main`;
}

/** An agent's main session or one of its web-chat threads — never Telegram, cron, etc. */
export function isChatSessionKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  const parts = key.split(":");
  if (parts[0] !== "agent" || !isAgentId(parts[1])) return false;
  if (parts.length === 3) return parts[2] === "main";
  return parts.length === 4 && parts[2] === "dashboard" && ID_RE.test(parts[3]);
}

export function agentOfSessionKey(key: string): string {
  return key.split(":")[1] ?? "";
}

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const b = obj(block);
      return b?.type === "text" && typeof b.text === "string" ? b.text : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function toChatMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  raw.forEach((m, i) => {
    const o = obj(m);
    const role = o?.role;
    if (role !== "user" && role !== "assistant") return;
    const text = textOf(o?.content).trim();
    if (!text) return;
    out.push({
      id: str(obj(o?.__openclaw)?.id) ?? `${role}-${i}`,
      role,
      text,
      ts: typeof o?.timestamp === "number" ? o.timestamp : null,
    });
  });
  return out;
}

export function toThreads(agentId: string, rows: unknown): ChatThread[] {
  const mainKey = mainSessionKey(agentId);
  const threads: ChatThread[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const o = obj(row);
    const key = str(o?.key);
    if (!o || !key || !isChatSessionKey(key) || agentOfSessionKey(key) !== agentId) continue;
    threads.push({
      key,
      title: key === mainKey ? "Main" : (str(o.label) ?? str(o.derivedTitle) ?? "New thread"),
      preview: str(o.lastMessagePreview),
      updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : null,
      running: o.hasActiveRun === true,
      primary: key === mainKey,
    });
  }
  // Main is always offered: the session is created by its first message.
  const main = threads.find((t) => t.primary) ?? {
    key: mainKey,
    title: "Main",
    preview: null,
    updatedAt: null,
    running: false,
    primary: true,
  };
  const rest = threads.filter((t) => !t.primary).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return [main, ...rest];
}

export function toStreamEvent(payload: unknown): StreamEvent | null {
  const o = obj(payload);
  if (!o) return null;
  const runId = str(o.runId);
  switch (o.state) {
    case "delta":
      // The gateway sends the full text so far, not just the increment.
      return { type: "delta", runId, text: textOf(obj(o.message)?.content) };
    case "final":
      return { type: "final", runId };
    case "aborted":
      return { type: "aborted", runId };
    case "error":
      return { type: "error", runId, message: str(o.errorMessage) ?? "The agent run failed." };
    default:
      return null;
  }
}
