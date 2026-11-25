"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatBlock, ChatMessage, ChatThread, LiveActivity, ToolStatus } from "@/lib/chat/messages";
import type { ChatAgent } from "./chat-client";

export const railItem = "block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors";
export const railActive = "bg-white/10 text-[color:var(--ck-text-primary)]";
export const railIdle = "text-[color:var(--ck-text-secondary)] hover:bg-white/5";
export const sectionLabel = "px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]";
export const headerBtn =
  "rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium hover:bg-white/10 disabled:opacity-50";

const MARKDOWN =
  "space-y-2 break-words leading-relaxed [&_a]:text-sky-300 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 " +
  "[&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-black/40 [&_code]:px-1 [&_code]:text-xs [&_h1]:font-semibold [&_h2]:font-semibold " +
  "[&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:whitespace-pre-wrap [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/40 [&_pre]:p-2 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:text-xs [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_th]:border " +
  "[&_th]:border-white/10 [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-5";

export function Markdown({ text }: { text: string }) {
  return (
    <div className={MARKDOWN}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function clock(ts: number | null): string {
  return ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

const STATUS_STYLE: Record<ToolStatus, string> = {
  running: "text-sky-300",
  completed: "text-emerald-300",
  failed: "text-red-300",
  blocked: "text-amber-300",
  skipped: "text-[color:var(--ck-text-tertiary)]",
  unknown: "text-[color:var(--ck-text-tertiary)]",
};

function CodeDetail({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">{label}</div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/35 p-2 text-[11px] leading-relaxed">{text}</pre>
    </div>
  );
}

function ToolCallBlock({ block }: { block: Extract<ChatBlock, { type: "tool_call" }> }) {
  return (
    <details className="rounded-xl border border-white/10 bg-black/15 px-3 py-2" open={block.status === "running"}>
      <summary className="cursor-pointer list-none text-xs">
        <span className={STATUS_STYLE[block.status]}>{block.status === "running" ? "●" : block.status === "completed" ? "✓" : block.status === "failed" ? "!" : "◆"}</span>
        <span className="ml-2 font-medium">{block.title}</span>
        <span className="ml-2 font-mono text-[10px] text-[color:var(--ck-text-tertiary)]">{block.name}</span>
      </summary>
      <CodeDetail label="Input" text={block.input} />
      <CodeDetail label="Output" text={block.output} />
    </details>
  );
}

function ToolResultBlock({ block }: { block: Extract<ChatBlock, { type: "tool_result" }> }) {
  return (
    <details className={`rounded-xl border px-3 py-2 ${block.isError ? "border-red-400/25 bg-red-400/5" : "border-white/10 bg-black/15"}`}>
      <summary className="cursor-pointer list-none text-xs">
        <span className={block.isError ? "text-red-300" : "text-emerald-300"}>{block.isError ? "!" : "✓"}</span>
        <span className="ml-2 font-medium">{block.name}</span>
        <span className="ml-2 text-[color:var(--ck-text-tertiary)]">{block.isError ? "failed" : "completed"}</span>
      </summary>
      <CodeDetail label="Output" text={block.output || "(no output)"} />
    </details>
  );
}

function Block({ block, mine }: { block: ChatBlock; mine: boolean }) {
  if (block.type === "text") return mine ? <p className="whitespace-pre-wrap break-words">{block.text}</p> : <Markdown text={block.text} />;
  if (block.type === "thinking") {
    return (
      <details className="rounded-xl border border-violet-300/15 bg-violet-300/5 px-3 py-2" open>
        <summary className="cursor-pointer text-xs font-medium text-violet-200">Thinking</summary>
        <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--ck-text-secondary)]">{block.text}</div>
      </details>
    );
  }
  if (block.type === "tool_call") return <ToolCallBlock block={block} />;
  if (block.type === "tool_result") return <ToolResultBlock block={block} />;
  if (block.type === "image") {
    return block.url ? (
      <a href={block.url} target="_blank" rel="noreferrer" className="block">
        <Image src={block.url} alt={block.fileName ?? "Attached image"} width={720} height={480} unoptimized className="max-h-80 w-auto max-w-full rounded-xl object-contain" />
      </a>
    ) : (
      <div className="rounded-xl border border-white/10 px-3 py-2 text-xs">Image attached{block.fileName ? `: ${block.fileName}` : ""}</div>
    );
  }
  return block.url ? (
    <a href={block.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/10 px-3 py-2 text-xs underline">
      {block.label}
    </a>
  ) : (
    <div className="rounded-lg border border-white/10 px-3 py-2 text-xs">{block.label}</div>
  );
}

export function Bubble({ message, agentName }: { message: ChatMessage; agentName: string }) {
  if (message.role === "tool") {
    return <div className="mx-auto w-full max-w-3xl space-y-2">{message.blocks.map((block, index) => <Block key={`${message.id}-${index}`} block={block} mine={false} />)}</div>;
  }
  const mine = message.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] space-y-2 rounded-2xl px-4 py-2 text-sm ${mine ? "rounded-br-sm bg-[color:var(--ck-accent-red)] text-white" : "rounded-bl-sm bg-white/10 text-[color:var(--ck-text-primary)]"}`}>
        {message.blocks.map((block, index) => <Block key={`${message.id}-${index}`} block={block} mine={mine} />)}
        <div className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-[color:var(--ck-text-tertiary)]"}`}>
          {[mine ? "you" : agentName, clock(message.ts)].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}

export function LiveActivityPanel({ thinking, activities }: { thinking: string | null; activities: LiveActivity[] }) {
  if (!thinking && activities.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-2">
      {thinking ? (
        <details className="rounded-xl border border-violet-300/15 bg-violet-300/5 px-3 py-2" open>
          <summary className="cursor-pointer text-xs font-medium text-violet-200">Thinking live</summary>
          <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--ck-text-secondary)]">{thinking}</div>
        </details>
      ) : null}
      {activities.map((activity) => (
        <details key={activity.id} className="rounded-xl border border-white/10 bg-black/15 px-3 py-2" open={activity.status === "running"}>
          <summary className="cursor-pointer list-none text-xs">
            <span className={STATUS_STYLE[activity.status]}>{activity.status === "running" ? "●" : activity.isError ? "!" : "✓"}</span>
            <span className="ml-2 font-medium">{activity.title}</span>
            <span className="ml-2 font-mono text-[10px] text-[color:var(--ck-text-tertiary)]">{activity.name}</span>
          </summary>
          <CodeDetail label="Input" text={activity.input} />
          <CodeDetail label="Output" text={activity.output} />
        </details>
      ))}
    </div>
  );
}

export function StreamingBubble({ text, agentName }: { text: string | null; agentName: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2 text-sm text-[color:var(--ck-text-primary)]">
        {text ? <Markdown text={text} /> : <span className="animate-pulse">{agentName} is working…</span>}
        <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">{agentName} · replying</div>
      </div>
    </div>
  );
}

export function AgentRail({
  agents,
  selected,
  query,
  onQuery,
  onSelect,
}: {
  agents: ChatAgent[];
  selected: string;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
}) {
  const needle = query.trim().toLowerCase();
  const shown = needle ? agents.filter((a) => `${a.name} ${a.id}`.toLowerCase().includes(needle)) : agents;
  const groups = new Map<string, ChatAgent[]>();
  for (const a of shown) {
    const label = a.teamName ?? "Personal";
    groups.set(label, [...(groups.get(label) ?? []), a]);
  }
  return (
    <div>
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Find an agent"
        className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm outline-none focus:border-white/25"
      />
      {[...groups.entries()].map(([label, list]) => (
        <div key={label} className="mb-2">
          <div className={sectionLabel}>{label}</div>
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.id)}
              title={a.id}
              className={`${railItem} ${a.id === selected ? railActive : railIdle}`}
            >
              <div className="truncate">{a.name}</div>
              <div className="truncate text-[10px] text-[color:var(--ck-text-tertiary)]">{a.isDefault ? "default" : a.id}</div>
            </button>
          ))}
        </div>
      ))}
      {shown.length === 0 ? <p className="px-2 text-xs text-[color:var(--ck-text-tertiary)]">No agents match.</p> : null}
    </div>
  );
}

export function ThreadList({
  threads,
  selected,
  onSelect,
}: {
  threads: ChatThread[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="mb-3 border-b border-[color:var(--ck-border-subtle)] pb-3">
      <div className={sectionLabel}>Threads</div>
      {threads.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t.key)}
          className={`${railItem} py-1.5 ${t.key === selected ? railActive : railIdle}`}
        >
          <div className="flex items-center gap-1.5 truncate text-xs font-medium">
            {t.running ? <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-sky-400" /> : null}
            <span className="truncate">{t.title}</span>
          </div>
          <div className="truncate text-[10px] text-[color:var(--ck-text-tertiary)]">{t.preview ?? (t.primary ? "the agent's main session" : "")}</div>
        </button>
      ))}
    </div>
  );
}
