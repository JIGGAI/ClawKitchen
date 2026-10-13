"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Folder tree over a team workspace, fed one directory per request by
 * GET /api/teams/files/tree. Folders expand on click; the root is loaded on
 * mount. Scaffold files the recipe expects (TEAM.md, TICKETS.md, …) keep
 * their required/optional badge and still appear when missing so they can be
 * created from the editor.
 */

export type WorkspaceTreeEntry = {
  path: string;
  name: string;
  kind: "dir" | "file";
  size?: number;
  updatedAtMs?: number;
  editable?: boolean;
};

export type ScaffoldFileEntry = {
  name: string;
  missing: boolean;
  required?: boolean;
  rationale?: string;
};

type DirState = { loading: boolean; error?: string; entries?: WorkspaceTreeEntry[] };

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function rowClass(selected: boolean, disabled: boolean): string {
  const base = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm";
  if (disabled) return `${base} cursor-not-allowed text-[color:var(--ck-text-tertiary)]`;
  if (selected) return `${base} bg-white/10 text-[color:var(--ck-text-primary)]`;
  return `${base} text-[color:var(--ck-text-secondary)] hover:bg-white/5`;
}

export function WorkspaceFileTree({
  teamId,
  scaffold,
  selectedPath,
  onSelectFile,
  fetchImpl,
}: {
  teamId: string;
  /** The recipe's expected files, for badges and for listing missing ones. */
  scaffold?: ScaffoldFileEntry[];
  selectedPath: string;
  onSelectFile: (path: string) => void;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}) {
  const doFetch = fetchImpl ?? fetch;
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const [open, setOpen] = useState<Set<string>>(new Set([""]));
  const [filter, setFilter] = useState("");

  const loadDir = useCallback(
    async (dir: string) => {
      setDirs((prev) => ({ ...prev, [dir]: { ...(prev[dir] ?? {}), loading: true, error: undefined } }));
      try {
        const res = await doFetch(
          `/api/teams/files/tree?teamId=${encodeURIComponent(teamId)}&dir=${encodeURIComponent(dir)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { ok?: boolean; entries?: WorkspaceTreeEntry[]; error?: string };
        if (!res.ok || !json.ok || !Array.isArray(json.entries)) {
          throw new Error(json.error || `Failed to list ${dir || "workspace"}`);
        }
        setDirs((prev) => ({ ...prev, [dir]: { loading: false, entries: json.entries } }));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setDirs((prev) => ({ ...prev, [dir]: { loading: false, error: message } }));
      }
    },
    [doFetch, teamId],
  );

  useEffect(() => {
    setDirs({});
    setOpen(new Set([""]));
    void loadDir("");
  }, [teamId, loadDir]);

  function toggleDir(dir: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else {
        next.add(dir);
        if (!dirs[dir]) void loadDir(dir);
      }
      return next;
    });
  }

  const scaffoldByName = useMemo(() => {
    const m = new Map<string, ScaffoldFileEntry>();
    for (const s of scaffold ?? []) m.set(s.name, s);
    return m;
  }, [scaffold]);

  // Scaffold files the recipe expects but the workspace lacks are shown at the
  // root (and inside their folder, e.g. notes/QA_CHECKLIST.md) as "missing" so
  // they can still be selected and created.
  const missingUnder = useCallback(
    (dir: string): WorkspaceTreeEntry[] => {
      const out: WorkspaceTreeEntry[] = [];
      for (const s of scaffold ?? []) {
        if (!s.missing) continue;
        const slash = s.name.lastIndexOf("/");
        const parent = slash === -1 ? "" : s.name.slice(0, slash);
        if (parent !== dir) continue;
        out.push({ path: s.name, name: s.name.slice(slash + 1), kind: "file", editable: true });
      }
      return out;
    },
    [scaffold],
  );

  const needle = filter.trim().toLowerCase();
  const matches = (e: WorkspaceTreeEntry) => !needle || e.path.toLowerCase().includes(needle);

  function renderDir(dir: string, depth: number): React.ReactNode {
    const state = dirs[dir];
    if (!state) return null;
    if (state.loading && !state.entries) {
      return <li className="px-2 py-1 text-xs text-[color:var(--ck-text-tertiary)]" style={{ paddingLeft: depth * 14 + 8 }}>Loading…</li>;
    }
    if (state.error) {
      return <li className="px-2 py-1 text-xs text-red-200" style={{ paddingLeft: depth * 14 + 8 }}>{state.error}</li>;
    }
    const entries = [...(state.entries ?? []), ...missingUnder(dir)];
    if (!entries.length) {
      return <li className="px-2 py-1 text-xs text-[color:var(--ck-text-tertiary)]" style={{ paddingLeft: depth * 14 + 8 }}>Empty folder</li>;
    }
    return entries.map((e) => {
      if (e.kind === "dir") {
        const isOpen = open.has(e.path);
        // A filter keeps folders visible so matches inside them stay reachable.
        return (
          <li key={e.path}>
            <button
              type="button"
              onClick={() => toggleDir(e.path)}
              className={rowClass(false, false)}
              style={{ paddingLeft: depth * 14 + 8 }}
              aria-expanded={isOpen}
            >
              <span className="w-3 text-xs leading-none text-[color:var(--ck-text-secondary)]">{isOpen ? "▾" : "▸"}</span>
              <span className="text-[color:var(--ck-text-primary)]">{e.name}/</span>
            </button>
            {isOpen ? <ul className="space-y-0.5">{renderDir(e.path, depth + 1)}</ul> : null}
          </li>
        );
      }
      if (!matches(e)) return null;
      const meta = scaffoldByName.get(e.path);
      const missing = Boolean(meta?.missing) && !state.entries?.some((x) => x.path === e.path);
      const disabled = e.editable === false;
      return (
        <li key={e.path}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectFile(e.path)}
            className={rowClass(selectedPath === e.path, disabled)}
            style={{ paddingLeft: depth * 14 + 8 }}
            title={disabled ? `Not a text file (${formatSize(e.size)})` : meta?.rationale || e.path}
            data-file-path={e.path}
          >
            <span className="w-3" />
            <span className={meta?.required ? "text-[color:var(--ck-text-primary)]" : ""}>{e.name}</span>
            {meta ? (
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                {meta.required ? "required" : "optional"}
              </span>
            ) : null}
            {missing ? <span className="text-xs text-[color:var(--ck-text-tertiary)]">missing</span> : null}
            <span className="ml-auto text-[10px] text-[color:var(--ck-text-tertiary)]">
              {disabled ? "binary" : formatSize(e.size)}
            </span>
          </button>
        </li>
      );
    });
  }

  return (
    <div className="ck-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Workspace files</div>
        <button
          type="button"
          onClick={() => {
            setDirs({});
            setOpen(new Set([""]));
            void loadDir("");
          }}
          className="text-xs text-[color:var(--ck-text-secondary)] hover:text-[color:var(--ck-text-primary)]"
        >
          Refresh
        </button>
      </div>
      <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
        Every file in the team workspace. Open folders to browse; binary files are listed but not editable.
      </div>
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter loaded files…"
        aria-label="Filter files"
        className="mt-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
      />
      <ul className="mt-3 max-h-[60vh] space-y-0.5 overflow-y-auto" data-testid="workspace-file-tree">
        {renderDir("", 0)}
      </ul>
    </div>
  );
}
