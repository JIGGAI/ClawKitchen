"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ChatThread } from "@/lib/chat/messages";
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
  "[&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/40 [&_pre]:p-2 " +
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

export function Bubble({ message, agentName }: { message: ChatMessage; agentName: string }) {
  const mine = message.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm ${
          mine
            ? "whitespace-pre-wrap break-words rounded-br-sm bg-[color:var(--ck-accent-red)] text-white"
            : "rounded-bl-sm bg-white/10 text-[color:var(--ck-text-primary)]"
        }`}
      >
        {mine ? message.text : <Markdown text={message.text} />}
        <div className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-[color:var(--ck-text-tertiary)]"}`}>
          {[mine ? "you" : agentName, clock(message.ts)].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}

export function StreamingBubble({ text, agentName }: { text: string | null; agentName: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2 text-sm text-[color:var(--ck-text-primary)]">
        {text ? <Markdown text={text} /> : <span className="animate-pulse">{agentName} is thinking…</span>}
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
    <div className="mt-3 border-t border-[color:var(--ck-border-subtle)] pt-3">
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
