"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import { mainSessionKey, type ChatMessage, type ChatThread, type StreamEvent } from "@/lib/chat/messages";
import { AgentRail, Bubble, headerBtn, StreamingBubble, ThreadList } from "./chat-parts";

export type ChatAgent = { id: string; name: string; team: string | null; teamName: string | null; isDefault: boolean };

const sendBtn =
  "rounded-lg bg-[color:var(--ck-accent-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

function pickAgent(agents: ChatAgent[], wanted: string): string {
  if (agents.some((a) => a.id === wanted)) return wanted;
  return (agents.find((a) => a.isDefault) ?? agents[0])?.id ?? "";
}

function threadFor(agentId: string, wanted: string): string {
  return wanted.startsWith(`agent:${agentId}:`) ? wanted : mainSessionKey(agentId);
}

export default function ChatClient({
  agents,
  initialAgent,
  initialThread,
}: {
  agents: ChatAgent[];
  initialAgent: string;
  initialThread: string;
}) {
  const [agentId, setAgentId] = useState(() => pickAgent(agents, initialAgent));
  const [threadKey, setThreadKey] = useState(() => threadFor(pickAgent(agents, initialAgent), initialThread));
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const agent = agents.find((a) => a.id === agentId) ?? null;
  const agentName = agent?.name ?? agentId;

  const loadThreads = useCallback(async () => {
    if (!agentId) return;
    try {
      const out = await fetchJson<{ threads: ChatThread[] }>(`/api/chat/threads?agent=${encodeURIComponent(agentId)}`, {
        cache: "no-store",
      });
      setThreads(out.threads);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [agentId]);

  const loadHistory = useCallback(async () => {
    try {
      const out = await fetchJson<{ messages: ChatMessage[]; running: boolean }>(
        `/api/chat/history?session=${encodeURIComponent(threadKey)}`,
        { cache: "no-store" },
      );
      setMessages(out.messages);
      setRunning(out.running);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [threadKey]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    setMessages([]);
    setStreamText(null);
    setError(null);
    void loadHistory();
  }, [loadHistory]);

  // The reply, live: one stream per open thread.
  useEffect(() => {
    const source = new EventSource(`/api/chat/stream?session=${encodeURIComponent(threadKey)}`);
    source.onmessage = (msg) => {
      let ev: StreamEvent;
      try {
        ev = JSON.parse(msg.data as string) as StreamEvent;
      } catch {
        return;
      }
      if (ev.type === "delta") {
        setRunning(true);
        setStreamText(ev.text);
        return;
      }
      if (ev.type === "error") setError(ev.message);
      setStreamText(null);
      setRunning(false);
      void loadHistory();
      void loadThreads();
    };
    return () => source.close();
  }, [threadKey, loadHistory, loadThreads]);

  // Linkable: /chat?agent=…&thread=…
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("agent", agentId);
    url.searchParams.set("thread", threadKey);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
  }, [agentId, threadKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streamText]);

  function selectAgent(id: string) {
    setAgentId(id);
    setThreadKey(mainSessionKey(id));
    setThreads([]);
  }

  async function newThread() {
    try {
      const out = await fetchJson<{ key: string }>("/api/chat/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: agentId }),
      });
      setThreadKey(out.key);
      await loadThreads();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: "user", text, ts: Date.now() };
    setInput("");
    setError(null);
    setSending(true);
    setRunning(true);
    setMessages((prev) => [...prev, optimistic]);
    try {
      await fetchJson("/api/chat/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: threadKey, message: text }),
      });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
      setRunning(false);
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function stop() {
    try {
      await fetchJson("/api/chat/abort", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: threadKey }),
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (agents.length === 0) {
    return <p className="mt-4 text-sm text-[color:var(--ck-text-tertiary)]">No agents found — the Kitchen manifest may be missing.</p>;
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-[color:var(--ck-border-subtle)]">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-[color:var(--ck-border-subtle)] p-2">
        <AgentRail agents={agents} selected={agentId} query={query} onQuery={setQuery} onSelect={selectAgent} />
        <ThreadList threads={threads} selected={threadKey} onSelect={setThreadKey} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--ck-border-subtle)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">
              {agentName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{agentName}</div>
              <div className="truncate font-mono text-[10px] text-[color:var(--ck-text-tertiary)]">{threadKey}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className={headerBtn} onClick={() => void newThread()}>
              + New thread
            </button>
            <Link href={`/agents/${encodeURIComponent(agentId)}`} className={headerBtn}>
              Edit
            </Link>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && !running ? (
            <p className="text-sm text-[color:var(--ck-text-tertiary)]">No messages with {agentName} here yet — say hello.</p>
          ) : null}
          {messages.map((m) => (
            <Bubble key={m.id} message={m} agentName={agentName} />
          ))}
          {running ? <StreamingBubble text={streamText} agentName={agentName} /> : null}
          <div ref={endRef} />
        </div>

        {error ? <div className="border-t border-[color:var(--ck-border-subtle)] px-4 py-2 text-sm text-red-400">{error}</div> : null}

        <form
          className="flex items-end gap-2 border-t border-[color:var(--ck-border-subtle)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={Math.min(8, Math.max(1, input.split("\n").length))}
            placeholder={running ? `Type ahead — ${agentName} gets this next` : `Message ${agentName}…`}
            className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
          />
          {running ? (
            <button type="button" className={headerBtn} onClick={() => void stop()}>
              Stop
            </button>
          ) : null}
          <button type="submit" className={sendBtn} disabled={!input.trim() || sending}>
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
