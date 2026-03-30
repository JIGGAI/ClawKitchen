"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

type PinnedItem = MemoryItem & {
  pinnedAt: string;
  pinnedBy: string;
  _key: string;
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

type ViewMode = "all" | "file" | "md-viewer";

/* ---------- helpers ---------- */

function memoryKey(it: { _file?: string; _line?: number }): string {
  return `${it._file ?? ""}:${it._line ?? 0}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(isoDate: string): string {
  try {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return isoDate;
  }
}

/* ---------- sub-components ---------- */

function FileIcon({ kind }: { kind: string }) {
  if (kind === "md") return <span title="Markdown document">📄</span>;
  if (kind === "jsonl") return <span title="JSONL stream">📊</span>;
  return <span title="File">📎</span>;
}

function MemoryItemCard({
  it,
  isPinned,
  pinningKey,
  onPin,
  onUnpin,
  onDelete,
  deletingKey,
}: {
  it: MemoryItem | PinnedItem;
  isPinned: boolean;
  pinningKey: string | null;
  onPin: (it: MemoryItem) => void;
  onUnpin: (it: { _file?: string; _line?: number }) => void;
  onDelete: (it: MemoryItem) => void;
  deletingKey: string | null;
}) {
  const k = memoryKey(it);
  const hasPinnedAt = "pinnedAt" in it;

  return (
    <div
      className={`rounded-[var(--ck-radius-sm)] border p-3 ${
        it._parseError
          ? "border-red-400/30 bg-red-500/5"
          : "border-white/10 bg-black/25"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 text-xs text-[color:var(--ck-text-tertiary)]">
          <span className="font-mono">{relativeTime(it.ts)}</span>
          <span className="mx-1">•</span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono">{it.type}</span>
          {it.author !== "unknown" && (
            <>
              <span className="mx-1">•</span>
              <span className="font-mono">{it.author}</span>
            </>
          )}
          {it._file && (
            <>
              <span className="mx-1">•</span>
              <span className="font-mono text-[color:var(--ck-text-tertiary)]">{it._file}:{it._line}</span>
            </>
          )}
          {hasPinnedAt && (
            <>
              <span className="mx-1">•</span>
              <span className="font-mono">📌 pinned {relativeTime((it as PinnedItem).pinnedAt)}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isPinned ? (
            <button
              type="button"
              onClick={() => onUnpin(it)}
              disabled={pinningKey === k}
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
            >
              {pinningKey === k ? "…" : "Unpin"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPin(it)}
              disabled={pinningKey === k || !it._file || !it._line}
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
            >
              {pinningKey === k ? "…" : "Pin"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(it)}
            disabled={deletingKey === k || !it._file || !it._line}
            className="rounded-[var(--ck-radius-sm)] border border-red-400/20 bg-red-500/5 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
          >
            {deletingKey === k ? "…" : "×"}
          </button>
        </div>
      </div>

      {it._parseError && (
        <div className="mt-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300">
          ⚠ Parse error: {it._parseError}
        </div>
      )}

      <div className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--ck-text-primary)]">
        {it.content}
      </div>

      {it.source ? (
        <pre className="mt-2 overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 p-2 text-[10px] text-[color:var(--ck-text-secondary)]">
          {JSON.stringify(it.source, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/* ---------- main component ---------- */

export function TeamMemoryTab({ teamId }: { teamId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileList, setFileList] = useState<MemoryFileInfo[]>([]);
  const [markdownFiles, setMarkdownFiles] = useState<MarkdownFile[]>([]);
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>([]);
  const [items, setItems] = useState<MemoryItem[]>([]);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedMd, setSelectedMd] = useState<string>("");

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFile, setFilterFile] = useState("");

  // Add item form
  const [newType, setNewType] = useState("learning");
  const [newContent, setNewContent] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newTargetFile, setNewTargetFile] = useState("team.jsonl");
  const [saving, setSaving] = useState(false);

  // Action states
  const [pinningKey, setPinningKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Markdown editor
  const [editingMd, setEditingMd] = useState(false);
  const [mdEditContent, setMdEditContent] = useState("");
  const [savingMd, setSavingMd] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/memory?teamId=${encodeURIComponent(teamId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        files?: MemoryFileInfo[];
        markdownFiles?: MarkdownFile[];
        pinnedItems?: PinnedItem[];
        items?: MemoryItem[];
      };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load memory");
      setFileList(Array.isArray(json.files) ? json.files : []);
      setMarkdownFiles(Array.isArray(json.markdownFiles) ? json.markdownFiles : []);
      setPinnedItems(Array.isArray(json.pinnedItems) ? json.pinnedItems : []);
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* ---------- derived data ---------- */

  const jsonlFiles = useMemo(() => fileList.filter((f) => f.kind === "jsonl"), [fileList]);
  const writableJsonlFiles = useMemo(() => jsonlFiles.filter((f) => f.name !== "pinned.jsonl"), [jsonlFiles]);
  const mdFileList = useMemo(() => fileList.filter((f) => f.kind === "md"), [fileList]);

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    for (const it of items) if (!it._parseError) types.add(it.type);
    for (const it of pinnedItems) types.add(it.type);
    return Array.from(types).sort();
  }, [items, pinnedItems]);

  const allFiles = useMemo(() => {
    const files = new Set<string>();
    for (const it of items) if (it._file) files.add(it._file);
    return Array.from(files).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterFile) result = result.filter((it) => it._file === filterFile);
    if (filterType) result = result.filter((it) => it.type === filterType);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (it) =>
          it.content.toLowerCase().includes(q) ||
          it.author.toLowerCase().includes(q) ||
          it.type.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, filterFile, filterType, searchQuery]);

  const pinnedKeySet = useMemo(() => new Set(pinnedItems.map((x) => x._key)), [pinnedItems]);

  const selectedMarkdown = useMemo(
    () => markdownFiles.find((f) => f.name === selectedMd),
    [markdownFiles, selectedMd]
  );

  const typeOptions = useMemo(
    () => [
      { label: "learning", value: "learning" },
      { label: "decision", value: "decision" },
      { label: "bug", value: "bug" },
      { label: "customer", value: "customer" },
      { label: "release", value: "release" },
      { label: "research", value: "research" },
      { label: "strategy", value: "strategy" },
    ],
    []
  );

  /* ---------- actions ---------- */

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
        key: { file: it._file, line: it._line },
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
        key: { file: it._file, line: it._line },
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

  async function deleteItem(it: MemoryItem) {
    const key = memoryKey(it);
    if (!it._file || !it._line) return;
    if (!window.confirm(`Delete this ${it.type} item from ${it._file}?`)) return;
    setDeletingKey(key);
    setError("");
    try {
      const payload = { op: "delete", file: it._file, line: it._line };
      const res = await fetch(`/api/teams/memory?teamId=${encodeURIComponent(teamId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to delete");
      await refresh();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setDeletingKey(null);
    }
  }

  async function saveMarkdown() {
    if (!selectedMd) return;
    setSavingMd(true);
    setError("");
    try {
      const payload = { op: "save-md", file: selectedMd, content: mdEditContent };
      const res = await fetch(`/api/teams/memory?teamId=${encodeURIComponent(teamId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save");
      setEditingMd(false);
      await refresh();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSavingMd(false);
    }
  }

  /* ---------- render ---------- */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="ck-glass p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Team Memory</div>
            <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
              Knowledge base in{" "}
              <span className="font-mono">shared-context/memory/</span>
              {" · "}
              {fileList.length} files ({jsonlFiles.length} streams, {mdFileList.length} docs)
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </div>

      {/* File Browser */}
      <div className="ck-glass p-4">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Files</div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {fileList.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => {
                if (f.kind === "md") {
                  setViewMode("md-viewer");
                  setSelectedMd(f.name);
                  setEditingMd(false);
                } else if (f.kind === "jsonl") {
                  setViewMode("file");
                  setFilterFile(f.name);
                  setSelectedFile(f.name);
                }
              }}
              className={`flex items-center gap-2 rounded-[var(--ck-radius-sm)] border p-2 text-left transition-colors ${
                (viewMode === "md-viewer" && selectedMd === f.name) ||
                (viewMode === "file" && selectedFile === f.name)
                  ? "border-[var(--ck-accent-red)]/50 bg-[var(--ck-accent-red)]/10"
                  : "border-white/10 bg-black/25 hover:bg-white/5"
              }`}
            >
              <FileIcon kind={f.kind} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-[color:var(--ck-text-primary)]">{f.name}</div>
                <div className="text-[10px] text-[color:var(--ck-text-tertiary)]">
                  {formatBytes(f.sizeBytes)} · {relativeTime(f.modifiedAt)}
                </div>
              </div>
            </button>
          ))}
          {fileList.length === 0 && (
            <div className="text-sm text-[color:var(--ck-text-secondary)]">No memory files found.</div>
          )}
        </div>
        {viewMode !== "all" && (
          <button
            type="button"
            onClick={() => {
              setViewMode("all");
              setFilterFile("");
              setSelectedFile("");
              setSelectedMd("");
              setEditingMd(false);
            }}
            className="mt-2 text-xs text-[color:var(--ck-accent-red)] hover:underline"
          >
            ← Show all items
          </button>
        )}
      </div>

      {/* Markdown Viewer */}
      {viewMode === "md-viewer" && selectedMarkdown && (
        <div className="ck-glass p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">
              📄 {selectedMarkdown.name}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[color:var(--ck-text-tertiary)]">
                {formatBytes(selectedMarkdown.sizeBytes)} · {relativeTime(selectedMarkdown.modifiedAt)}
              </span>
              {editingMd ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingMd(false)}
                    className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveMarkdown()}
                    disabled={savingMd}
                    className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {savingMd ? "Saving…" : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMdEditContent(selectedMarkdown.content);
                    setEditingMd(true);
                  }}
                  className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {editingMd ? (
            <textarea
              value={mdEditContent}
              onChange={(e) => setMdEditContent(e.target.value)}
              className="mt-3 h-[400px] w-full resize-y rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 p-3 font-mono text-sm text-[color:var(--ck-text-primary)]"
            />
          ) : (
            <div className="mt-3 max-h-[500px] overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 p-4">
              <div className="prose prose-invert prose-sm max-w-none text-sm text-[color:var(--ck-text-primary)]">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Style links for dark theme
                    a: ({ href, children, ...props }) => (
                      <a href={href} {...props} className="text-blue-400 hover:text-blue-300 underline">
                        {children}
                      </a>
                    ),
                    // Style code blocks
                    code: ({ className, children, ...props }) => (
                      <code className={`${className || ''} bg-black/50 px-1 py-0.5 rounded text-xs`} {...props}>
                        {children}
                      </code>
                    ),
                  }}
                >
                  {selectedMarkdown.content || "(empty file)"}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search & Filter (shown when not in md viewer) */}
      {viewMode !== "md-viewer" && (
        <>
          {/* Search & filter bar */}
          <div className="ck-glass p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                  Search
                </div>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search content, author, type…"
                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
                />
              </label>

              <label className="w-36">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">Type</div>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
                >
                  <option value="">All types</option>
                  {allTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="w-48">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">File</div>
                <select
                  value={filterFile}
                  onChange={(e) => {
                    setFilterFile(e.target.value);
                    if (e.target.value) {
                      setViewMode("file");
                      setSelectedFile(e.target.value);
                    } else {
                      setViewMode("all");
                      setSelectedFile("");
                    }
                  }}
                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
                >
                  <option value="">All streams</option>
                  {allFiles.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Add item form */}
          <div className="ck-glass p-4">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Add memory item</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">Type</div>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
                >
                  {typeOptions.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                  Target file
                </div>
                <select
                  value={newTargetFile}
                  onChange={(e) => setNewTargetFile(e.target.value)}
                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
                >
                  {writableJsonlFiles.length > 0 ? (
                    writableJsonlFiles.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name}
                      </option>
                    ))
                  ) : (
                    <option value="team.jsonl">team.jsonl</option>
                  )}
                </select>
              </label>

              <label className="block">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                  Source (optional)
                </div>
                <input
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
                  placeholder="ticket, PR, path…"
                />
              </label>

              <label className="block md:col-span-3">
                <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                  Content
                </div>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="mt-1 h-[80px] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 text-sm text-[color:var(--ck-text-primary)]"
                  placeholder="Write a specific, attributable memory item…"
                />
              </label>

              <div className="md:col-span-3">
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
                        file: newTargetFile,
                      };
                      const res = await fetch(
                        `/api/teams/memory?teamId=${encodeURIComponent(teamId)}`,
                        {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify(payload),
                        }
                      );
                      const json = (await res.json()) as { ok?: boolean; error?: string };
                      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to append");
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
                  {saving ? "Saving…" : `Append to ${newTargetFile}`}
                </button>
              </div>
            </div>
          </div>

          {/* Pinned items */}
          {pinnedItems.length > 0 && (
            <div className="ck-glass p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">
                  📌 Pinned ({pinnedItems.length})
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {pinnedItems.map((it) => (
                  <MemoryItemCard
                    key={it._key}
                    it={it}
                    isPinned={true}
                    pinningKey={pinningKey}
                    onPin={pin}
                    onUnpin={unpin}
                    onDelete={deleteItem}
                    deletingKey={deletingKey}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Items list */}
          <div className="ck-glass p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">
                {filterFile ? `📊 ${filterFile}` : "All Streams"}{" "}
                <span className="font-normal text-[color:var(--ck-text-tertiary)]">
                  ({filteredItems.length}
                  {filteredItems.length !== items.length ? ` of ${items.length}` : ""} items)
                </span>
              </div>
            </div>

            {loading ? (
              <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">Loading…</div>
            ) : null}

            <div className="mt-3 space-y-3">
              {filteredItems.length ? (
                filteredItems.map((it) => (
                  <MemoryItemCard
                    key={`${it._file ?? "?"}:${it._line ?? 0}`}
                    it={it}
                    isPinned={pinnedKeySet.has(memoryKey(it))}
                    pinningKey={pinningKey}
                    onPin={pin}
                    onUnpin={unpin}
                    onDelete={deleteItem}
                    deletingKey={deletingKey}
                  />
                ))
              ) : (
                <div className="text-sm text-[color:var(--ck-text-secondary)]">
                  {searchQuery || filterType || filterFile
                    ? "No items match your filters."
                    : "No memory items yet. Add items above or let agents write to JSONL streams."}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
