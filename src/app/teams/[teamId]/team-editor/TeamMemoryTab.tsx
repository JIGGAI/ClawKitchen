"use client";

import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/lib/errors";

type MemoryItem = {
  ts: string;
  author: string;
  type: string;
  content: string;
  source?: unknown;
  _file?: string;
  _line?: number;
};

type PinnedItem = MemoryItem & {
  pinnedAt: string;
  pinnedBy: string;
  _key: string;
};

function memoryKey(it: { _file?: string; _line?: number }): string {
  return `${it._file ?? ""}:${it._line ?? 0}`;
}

export function TeamMemoryTab({ teamId }: { teamId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>([]);
  const [items, setItems] = useState<MemoryItem[]>([]);

  const [newType, setNewType] = useState("learning");
  const [newContent, setNewContent] = useState("");
  const [newSource, setNewSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [pinningKey, setPinningKey] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/memory?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        files?: string[];
        pinnedItems?: PinnedItem[];
        items?: MemoryItem[];
      };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load memory");
      setFiles(Array.isArray(json.files) ? json.files : []);
      setPinnedItems(Array.isArray(json.pinnedItems) ? json.pinnedItems : []);
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: unknown) {
      setError(errorMessage(e));
      setFiles([]);
      setPinnedItems([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is defined inline; teamId is the only intended trigger.
  }, [teamId]);

  const examples = useMemo(
    () => [
      { label: "decision", value: "decision" },
      { label: "learning", value: "learning" },
      { label: "bug", value: "bug" },
      { label: "customer", value: "customer" },
      { label: "release", value: "release" },
    ],
    []
  );

  const pinnedKeySet = useMemo(() => new Set(pinnedItems.map((x) => x._key)), [pinnedItems]);

  async function pin(it: MemoryItem) {
    const key = memoryKey(it);
    if (!it._file || !it._line) return;

    setPinningKey(key);
    setError("");
    try {
      const payload = {
        op: "pin",
        ts: new Date().toISOString(),
        actor: `${teamId}-lead`,
        key: { file: "team.jsonl", line: it._line },
        item: { ts: it.ts, author: it.author, type: it.type, content: it.content, source: it.source },
      };
      const res = await fetch(`/api/teams/memory?teamId=${encodeURIComponent(teamId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to pin");
      await refresh();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setPinningKey(null);
    }
  }

  async function unpin(it: { _file?: string; _line?: number }) {
    const key = memoryKey(it);
    if (!it._file || !it._line) return;

    setPinningKey(key);
    setError("");
    try {
      const payload = {
        op: "unpin",
        ts: new Date().toISOString(),
        actor: `${teamId}-lead`,
        key: { file: "team.jsonl", line: it._line },
      };
      const res = await fetch(`/api/teams/memory?teamId=${encodeURIComponent(teamId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to unpin");
      await refresh();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setPinningKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="ck-glass p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Team memory (file-first)</div>
            <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
              Stored in <span className="font-mono">shared-context/memory/*.jsonl</span>. Items must be attributable.
            </div>
            <div className="mt-2 text-xs text-[color:var(--ck-text-secondary)]">
              Canonical memory model doc:{" "}
              <a
                className="underline decoration-white/20 underline-offset-4 hover:decoration-white/40"
                href="https://github.com/JIGGAI/ClawRecipes/blob/main/docs/MEMORY_MODEL.md"
                target="_blank"
                rel="noreferrer"
              >
                ClawRecipes/docs/MEMORY_MODEL.md
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded border border-red-400/30 bg-red-500/10 p-2 text-sm text-red-100">{error}</div>
        ) : null}

        <div className="mt-3 text-xs text-[color:var(--ck-text-secondary)]">Files: {files.length ? files.join(", ") : "(none)"}</div>
      </div>

      <div className="ck-glass p-4">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Add memory item</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">type</div>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
            >
              {examples.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">source (ticket/pr/path)</div>
            <input
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
              placeholder="e.g. ticket 0088, PR https://..., shared-context/DECISIONS.md"
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">content</div>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="mt-1 h-[110px] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 text-sm text-[color:var(--ck-text-primary)]"
              placeholder="Write a small, specific memory item…"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="button"
              disabled={saving || !newContent.trim()}
              onClick={async () => {
                setSaving(true);
                setError("");
                try {
                  const payload = {
                    op: "append",
                    ts: new Date().toISOString(),
                    author: `${teamId}-lead`,
                    type: newType,
                    content: newContent.trim(),
                    source: newSource.trim() ? { text: newSource.trim() } : undefined,
                    file: "team.jsonl",
                  };
                  const res = await fetch(`/api/teams/memory?teamId=${encodeURIComponent(teamId)}`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  const json = (await res.json()) as { ok?: boolean; error?: string };
                  if (!res.ok || !json.ok) throw new Error(json.error || "Failed to append memory");
                  setNewContent("");
                  setNewSource("");
                  await refresh();
                } catch (e: unknown) {
                  setError(errorMessage(e));
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Append to team.jsonl"}
            </button>
          </div>
        </div>
      </div>

      <div className="ck-glass p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Pinned memory</div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">{pinnedItems.length} pinned</div>
        </div>

        {loading ? <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">Loading…</div> : null}

        <div className="mt-3 space-y-3">
          {pinnedItems.length ? (
            pinnedItems.map((it) => (
              <div key={it._key} className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-[color:var(--ck-text-tertiary)]">
                    <span className="font-mono">{it.ts}</span>
                    <span className="mx-2">•</span>
                    <span className="rounded bg-white/5 px-2 py-0.5 font-mono">{it.type}</span>
                    <span className="mx-2">•</span>
                    <span className="font-mono">{it.author}</span>
                    <span className="mx-2">•</span>
                    <span className="font-mono">pinned {it.pinnedAt}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void unpin(it)}
                    disabled={pinningKey === it._key}
                    className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
                  >
                    {pinningKey === it._key ? "Unpinning…" : "Unpin"}
                  </button>
                </div>

                <div className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--ck-text-primary)]">{it.content}</div>

                {it.source ? (
                  <pre className="mt-2 overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 p-2 text-[10px] text-[color:var(--ck-text-secondary)]">
                    {JSON.stringify(it.source, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          ) : (
            <div className="text-sm text-[color:var(--ck-text-secondary)]">No pinned items yet.</div>
          )}
        </div>
      </div>

      <div className="ck-glass p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Recent memory</div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">Showing {items.length} (max 200)</div>
        </div>

        {loading ? <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">Loading…</div> : null}

        <div className="mt-3 space-y-3">
          {items.length ? (
            items.map((it) => {
              const k = memoryKey(it);
              const isPinned = pinnedKeySet.has(k);
              return (
                <div key={`${it._file ?? "?"}:${it._line ?? 0}`} className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-[color:var(--ck-text-tertiary)]">
                      <span className="font-mono">{it.ts}</span>
                      <span className="mx-2">•</span>
                      <span className="rounded bg-white/5 px-2 py-0.5 font-mono">{it.type}</span>
                      <span className="mx-2">•</span>
                      <span className="font-mono">{it.author}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {it._file ? (
                        <span className="text-[10px] text-[color:var(--ck-text-tertiary)] font-mono">
                          {it._file}:{it._line}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void pin(it)}
                        disabled={isPinned || pinningKey === k || !it._file || !it._line}
                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
                      >
                        {isPinned ? "Pinned" : pinningKey === k ? "Pinning…" : "Pin"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--ck-text-primary)]">{it.content}</div>

                  {it.source ? (
                    <pre className="mt-2 overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 p-2 text-[10px] text-[color:var(--ck-text-secondary)]">
                      {JSON.stringify(it.source, null, 2)}
                    </pre>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="text-sm text-[color:var(--ck-text-secondary)]">No memory items yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
