/** Chat shapes mapped from OpenClaw gateway payloads. Pure — the routes do the I/O. */

export type ToolStatus = "running" | "completed" | "failed" | "blocked" | "skipped" | "unknown";

export type ChatBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      title: string;
      input: string | null;
      output: string | null;
      isError: boolean;
      status: ToolStatus;
    }
  | { type: "tool_result"; id: string; name: string; output: string; isError: boolean }
  | { type: "image"; mimeType: string | null; url: string | null; fileName: string | null }
  | { type: "attachment"; label: string; mimeType: string | null; url: string | null };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  text: string;
  blocks: ChatBlock[];
  ts: number | null;
};

export type ChatThread = {
  key: string;
  title: string;
  preview: string | null;
  updatedAt: number | null;
  running: boolean;
  primary: boolean;
};

export type LiveActivity = {
  id: string;
  name: string;
  title: string;
  phase: "start" | "update" | "result";
  status: ToolStatus;
  input: string | null;
  output: string | null;
  isError: boolean;
};

export type StreamEvent =
  | { type: "delta"; runId: string | null; text: string }
  | { type: "thinking"; runId: string | null; itemId: string; text: string }
  | { type: "activity"; runId: string | null; activity: LiveActivity }
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

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const found = str(value);
    if (found) return found;
  }
  return null;
}

function bounded(value: string, max = 20_000): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n\n… truncated (${value.length} characters)`;
}

function displayValue(value: unknown): string | null {
  if (typeof value === "string") return bounded(value);
  if (value === undefined || value === null) return null;
  try {
    return bounded(JSON.stringify(value, null, 2));
  } catch {
    return bounded(String(value));
  }
}

function resultText(value: unknown): string {
  const record = obj(value);
  const direct = firstString(record?.text, record?.content);
  if (direct) return bounded(direct);
  if (Array.isArray(record?.content)) return bounded(textOf(record.content));
  return displayValue(value) ?? "";
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

function toolStatus(value: unknown): ToolStatus {
  return value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "blocked" ||
    value === "skipped"
    ? value
    : "unknown";
}

type ActivityIndex = {
  byMessage: Map<string, Obj[]>;
  byCall: Map<string, Obj>;
};

function indexActivity(raw: unknown): ActivityIndex {
  const byMessage = new Map<string, Obj[]>();
  const byCall = new Map<string, Obj>();
  for (const row of Array.isArray(raw) ? raw : []) {
    const record = obj(row);
    const messageId = str(record?.messageId);
    const items = Array.isArray(record?.items)
      ? record.items.map(obj).filter((item): item is Obj => Boolean(item))
      : [];
    if (messageId && items.length) byMessage.set(messageId, items);
    for (const item of items) {
      const callId = firstString(item.toolCallId, item.itemId);
      if (callId) byCall.set(callId, item);
    }
  }
  return { byMessage, byCall };
}

function messageId(message: Obj, fallback: string): string {
  return firstString(obj(message.__openclaw)?.id, message.id, message.messageId) ?? fallback;
}

function mediaBlock(block: Obj): ChatBlock | null {
  if (block.type === "image" || block.type === "image_url") {
    const source = obj(block.source);
    const imageUrl = obj(block.image_url);
    const mimeType = firstString(block.mimeType, block.mediaType, source?.media_type, source?.mimeType);
    const rawUrl = firstString(block.url, imageUrl?.url, source?.url);
    const data = firstString(block.data, source?.data);
    const url = rawUrl ?? (data && mimeType ? `data:${mimeType};base64,${data}` : null);
    return { type: "image", mimeType, url, fileName: firstString(block.fileName, block.name) };
  }
  if (block.type === "attachment" || block.type === "file") {
    const attachment = obj(block.attachment) ?? block;
    return {
      type: "attachment",
      label: firstString(attachment.label, attachment.fileName, attachment.name) ?? "Attachment",
      mimeType: firstString(attachment.mimeType, attachment.mediaType),
      url: firstString(attachment.url, attachment.mediaUrl),
    };
  }
  return null;
}

function contentBlocks(message: Obj, activity: ActivityIndex, id: string): ChatBlock[] {
  const content =
    typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
  if (!Array.isArray(content)) return [];
  const messageActivities = activity.byMessage.get(id) ?? [];
  return content.flatMap((rawBlock, blockIndex): ChatBlock[] => {
    const block = obj(rawBlock);
    if (!block) return [];
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      return [{ type: "text", text: block.text }];
    }
    const thinking = firstString(block.thinking, block.text);
    if ((block.type === "thinking" || block.type === "reasoning") && thinking) {
      return [{ type: "thinking", text: thinking }];
    }
    if (
      block.type === "toolCall" ||
      block.type === "tool_call" ||
      block.type === "toolUse" ||
      block.type === "tool_use"
    ) {
      const callId =
        firstString(block.id, block.toolCallId, block.tool_call_id, block.toolUseId) ??
        `${id}-tool-${blockIndex}`;
      const prepared =
        activity.byCall.get(callId) ??
        messageActivities.find((item) => firstString(item.toolCallId, item.itemId) === callId);
      const name = firstString(block.name, prepared?.name) ?? "tool";
      return [
        {
          type: "tool_call",
          id: callId,
          name,
          title: firstString(prepared?.title) ?? name,
          input: displayValue(block.arguments ?? block.args ?? block.input),
          output: null,
          isError: false,
          status: toolStatus(prepared?.status),
        },
      ];
    }
    const media = mediaBlock(block);
    return media ? [media] : [];
  });
}

export function toChatMessages(raw: unknown, rawActivity?: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const activity = indexActivity(rawActivity);
  const out: ChatMessage[] = [];
  raw.forEach((entry, index) => {
    const message = obj(entry);
    if (!message) return;
    const role = message.role;
    const id = messageId(message, `${String(role ?? "message")}-${index}`);
    const ts = typeof message.timestamp === "number" ? message.timestamp : null;
    if (role === "user" || role === "assistant") {
      const blocks = contentBlocks(message, activity, id);
      if (blocks.length) {
        out.push({ id, role, text: textOf(message.content).trim(), blocks, ts });
      }
      return;
    }
    if (role === "toolResult" || role === "tool_result" || role === "tool") {
      const callId = firstString(message.toolCallId, message.tool_call_id, message.toolUseId) ?? id;
      const name =
        firstString(message.toolName, message.tool_name, activity.byCall.get(callId)?.name) ?? "tool";
      const output = textOf(message.content) || resultText(message.content);
      const parent = [...out]
        .reverse()
        .find((candidate) =>
          candidate.blocks.some((block) => block.type === "tool_call" && block.id === callId),
        );
      if (parent) {
        parent.blocks = parent.blocks.map((block) =>
          block.type === "tool_call" && block.id === callId
            ? {
                ...block,
                output,
                isError: message.isError === true,
                status: message.isError === true ? "failed" : "completed",
              }
            : block,
        );
        return;
      }
      out.push({
        id,
        role: "tool",
        text: output,
        blocks: [{ type: "tool_result", id: callId, name, output, isError: message.isError === true }],
        ts,
      });
    }
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
  const main = threads.find((t) => t.primary) ?? {
    key: mainKey,
    title: "Main",
    preview: null,
    updatedAt: null,
    running: false,
    primary: true,
  };
  const rest = threads
    .filter((t) => !t.primary)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return [main, ...rest];
}

export function toStreamEvent(payload: unknown): StreamEvent | null {
  const o = obj(payload);
  if (!o) return null;
  const runId = str(o.runId);
  switch (o.state) {
    case "delta":
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

export function toAgentStreamEvent(payload: unknown): StreamEvent | null {
  const event = obj(payload);
  const data = obj(event?.data);
  if (!event || !data) return null;
  const runId = str(event.runId);
  if (event.stream === "thinking") {
    const itemId = firstString(data.itemId, data.id);
    if (!itemId || typeof data.text !== "string" || data.phase === "persisted") return null;
    return { type: "thinking", runId, itemId, text: data.text };
  }
  if (event.stream === "item" && data.kind === "tool") {
    const id = firstString(data.toolCallId, data.itemId);
    if (!id) return null;
    const phase = data.phase === "end" ? "result" : data.phase === "update" ? "update" : "start";
    return {
      type: "activity",
      runId,
      activity: {
        id,
        name: firstString(data.name) ?? "tool",
        title: firstString(data.title, data.name) ?? "Tool",
        phase,
        status: toolStatus(data.status),
        input: null,
        output: firstString(data.summary, data.progressText, data.error),
        isError: data.status === "failed" || Boolean(data.error),
      },
    };
  }
  if (event.stream !== "tool") return null;
  const id = str(data.toolCallId);
  if (!id) return null;
  const phase = data.phase === "result" ? "result" : data.phase === "update" ? "update" : "start";
  const result = phase === "result" ? data.result : data.partialResult;
  const isError = data.isError === true;
  return {
    type: "activity",
    runId,
    activity: {
      id,
      name: firstString(data.name) ?? "tool",
      title: firstString(data.title, data.name) ?? "Tool",
      phase,
      status: phase === "result" ? (isError ? "failed" : "completed") : "running",
      input: phase === "start" ? displayValue(data.args) : null,
      output: phase === "start" ? null : resultText(result),
      isError,
    },
  };
}
