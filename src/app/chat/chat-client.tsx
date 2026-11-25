"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import { mainSessionKey, type BackgroundActivity, type ChatMessage, type ChatThread, type LiveActivity, type StreamEvent } from "@/lib/chat/messages";
import { AgentRail, BackgroundActivityPanel, Bubble, headerBtn, LiveActivityPanel, StreamingBubble, ThreadList } from "./chat-parts";

export type ChatAgent = { id: string; name: string; team: string | null; teamName: string | null; isDefault: boolean };

const sendBtn =
  "rounded-lg bg-[color:var(--ck-accent-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

type DraftAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  content: string;
  origin: "paste" | "file";
};

function readImage(file: File, origin: DraftAttachment["origin"]): Promise<DraftAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name || "image"}`));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const comma = dataUrl.indexOf(",");
      if (comma < 0) return reject(new Error("Could not encode image"));
      resolve({
        id: crypto.randomUUID(),
        fileName: file.name || "image",
        mimeType: file.type,
        sizeBytes: file.size,
        dataUrl,
        content: dataUrl.slice(comma + 1),
        origin,
      });
    };
    reader.readAsDataURL(file);
  });
}

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
  const [backgroundActivities, setBackgroundActivities] = useState<BackgroundActivity[]>([]);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [thinkingText, setThinkingText] = useState<string | null>(null);
  const [liveActivities, setLiveActivities] = useState<LiveActivity[]>([]);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [showBackground, setShowBackground] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
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
      const out = await fetchJson<{ messages: ChatMessage[]; backgroundActivities: BackgroundActivity[]; running: boolean }>(
        `/api/chat/history?session=${encodeURIComponent(threadKey)}`,
        { cache: "no-store" },
      );
      setMessages(out.messages);
      setBackgroundActivities(out.backgroundActivities);
      setRunning(out.running);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [threadKey]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    setMessages([]);
    setBackgroundActivities([]);
    setShowBackground(false);
    setStreamText(null);
    setThinkingText(null);
    setLiveActivities([]);
    setError(null);
    void loadHistory();
  }, [loadHistory]);

  // The reply, live: one stream per open thread.
  useEffect(() => {
    const source = new EventSource(`/api/chat/stream?session=${encodeURIComponent(threadKey)}`);
    source.onmessage = async (msg) => {
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
      if (ev.type === "thinking") {
        setRunning(true);
        setThinkingText(ev.text);
        return;
      }
      if (ev.type === "activity") {
        setRunning(true);
        setLiveActivities((current) => {
          const previous = current.find((item) => item.id === ev.activity.id);
          const merged = previous
            ? {
                ...previous,
                ...ev.activity,
                input: ev.activity.input ?? previous.input,
                output: ev.activity.output ?? previous.output,
              }
            : ev.activity;
          return [...current.filter((item) => item.id !== merged.id), merged];
        });
        return;
      }
      if (ev.type === "error") setError(ev.message);
      setStreamText(null);
      setRunning(false);
      try {
        await Promise.all([loadHistory(), loadThreads()]);
      } finally {
        setThinkingText(null);
        setLiveActivities([]);
      }
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
    if (!followLatestRef.current) return;
    const messageList = messageListRef.current;
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
  }, [messages.length, streamText, thinkingText, liveActivities]);

  function handleMessageScroll() {
    const messageList = messageListRef.current;
    if (!messageList) return;
    const nearLatest = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 80;
    followLatestRef.current = nearLatest;
    setShowJumpToLatest(!nearLatest);
  }

  function jumpToLatest() {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    const messageList = messageListRef.current;
    messageList?.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
  }

  function selectAgent(id: string) {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
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

  async function addImages(files: File[], origin: DraftAttachment["origin"]) {
    const available = MAX_IMAGES - attachments.length;
    const accepted = files
      .filter((file) => IMAGE_TYPES.has(file.type) && file.size <= MAX_IMAGE_BYTES)
      .slice(0, Math.max(0, available));
    if (accepted.length !== files.length) {
      setError(`Use up to ${MAX_IMAGES} PNG, JPEG, WebP, GIF, or AVIF images, each 8 MB or smaller.`);
    }
    try {
      const next = await Promise.all(accepted.map((file) => readImage(file, origin)));
      setAttachments((current) => [...current, ...next].slice(0, MAX_IMAGES));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || sending) return;
    const sentAttachments = attachments;
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      text,
      blocks: [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...sentAttachments.map((attachment) => ({
          type: "image" as const,
          mimeType: attachment.mimeType,
          url: attachment.dataUrl,
          fileName: attachment.fileName,
        })),
      ],
      ts: Date.now(),
    };
    setInput("");
    setAttachments([]);
    setError(null);
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    setSending(true);
    setRunning(true);
    setMessages((prev) => [...prev, optimistic]);
    try {
      await fetchJson("/api/chat/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session: threadKey,
          message: text,
          attachments: sentAttachments.map(({ mimeType, fileName, content, origin }) => ({
            type: "image",
            mimeType,
            fileName,
            content,
            origin,
          })),
        }),
      });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
      setAttachments(sentAttachments);
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
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-[color:var(--ck-border-subtle)] p-2">
        <ThreadList threads={threads} selected={threadKey} onSelect={setThreadKey} />
        <AgentRail agents={agents} selected={agentId} query={query} onQuery={setQuery} onSelect={selectAgent} />
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
            {backgroundActivities.length ? (
              <button type="button" className={headerBtn} onClick={() => setShowBackground((value) => !value)} aria-expanded={showBackground}>
                Background activity
                <span className="ml-1 text-[color:var(--ck-text-tertiary)]">{backgroundActivities.length}</span>
              </button>
            ) : null}
            <button type="button" className={headerBtn} onClick={() => void newThread()}>
              + New thread
            </button>
            <Link href={`/agents/${encodeURIComponent(agentId)}`} className={headerBtn}>
              Edit
            </Link>
          </div>
        </header>

        {showBackground ? <BackgroundActivityPanel activities={backgroundActivities} /> : null}

        <div className="relative min-h-0 flex-1">
          <div ref={messageListRef} onScroll={handleMessageScroll} className="absolute inset-0 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && !running ? (
              <p className="text-sm text-[color:var(--ck-text-tertiary)]">No messages with {agentName} here yet — say hello.</p>
            ) : null}
            {messages.map((m) => (
              <Bubble key={m.id} message={m} agentName={agentName} />
            ))}
            {running ? <LiveActivityPanel thinking={thinkingText} activities={liveActivities} /> : null}
            {running ? <StreamingBubble text={streamText} agentName={agentName} /> : null}
          </div>
          {showJumpToLatest ? (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-[color:var(--ck-bg-glass-strong)] px-3 py-1.5 text-xs font-medium shadow-[var(--ck-shadow-2)] hover:border-white/25"
            >
              Jump to latest
            </button>
          ) : null}
        </div>

        {error ? <div className="border-t border-[color:var(--ck-border-subtle)] px-4 py-2 text-sm text-red-400">{error}</div> : null}

        <form
          className="border-t border-[color:var(--ck-border-subtle)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length) {
              e.preventDefault();
              void addImages(files, "file");
            }
          }}
        >
          {attachments.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="relative overflow-hidden rounded-lg border border-white/10 bg-white/5">
                  <Image src={attachment.dataUrl} alt={attachment.fileName} width={80} height={80} unoptimized className="h-20 w-20 object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.fileName}`}
                    onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              multiple
              className="hidden"
              onChange={(e) => {
                void addImages(Array.from(e.target.files ?? []), "file");
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className={headerBtn}
              onClick={() => fileRef.current?.click()}
              disabled={attachments.length >= MAX_IMAGES}
              title="Attach images"
            >
              + Image
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                if (files.length) {
                  e.preventDefault();
                  void addImages(files, "paste");
                }
              }}
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
            <button type="submit" className={sendBtn} disabled={(!input.trim() && attachments.length === 0) || sending}>
              Send
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-[color:var(--ck-text-tertiary)]">Paste, drop, or attach up to four images.</p>
        </form>
      </section>
    </div>
  );
}
