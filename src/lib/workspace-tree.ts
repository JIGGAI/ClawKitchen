import fs from "node:fs/promises";
import path from "node:path";

/**
 * One level of a team workspace, for the Files tab's folder tree.
 *
 * The tab used to show a fixed list of eight scaffold files, so anything else
 * in the workspace (BRAND.md, shared-context/…, roles/…) was invisible there.
 * Listing one directory per request keeps a 2,000-file workspace usable: the
 * client expands folders on demand instead of receiving the whole tree.
 */

export type WorkspaceEntry = {
  /** Workspace-relative POSIX path, e.g. "shared-context/brand-voice.md". */
  path: string;
  name: string;
  kind: "dir" | "file";
  size?: number;
  updatedAtMs?: number;
  /** False for files the editor should not open as text (binary, or too large). */
  editable?: boolean;
};

/** Never listed: VCS internals, dependency trees, and secret stores. */
export const HIDDEN_ENTRY_NAMES = new Set([".git", "node_modules", ".secrets", ".DS_Store"]);

/** Extensions the text editor must not open. Everything else is treated as text. */
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".heic",
  ".mp4", ".mov", ".m4v", ".webm", ".mp3", ".wav", ".m4a",
  ".db", ".sqlite", ".sqlite3", ".db-wal", ".db-shm",
  ".zip", ".gz", ".tar", ".tgz", ".7z",
  ".pdf", ".docx", ".xlsx", ".pptx",
  ".woff", ".woff2", ".ttf", ".otf",
]);

/** Files above this size are shown but not opened in the editor. */
export const MAX_EDITABLE_BYTES = 2 * 1024 * 1024;

export function isEditableWorkspaceFile(name: string, size: number): boolean {
  if (size > MAX_EDITABLE_BYTES) return false;
  return !BINARY_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/**
 * Normalise a client-supplied directory path to a workspace-relative POSIX
 * path, or return null when it would escape the workspace. "" and "." mean
 * the root.
 */
export function normalizeWorkspaceDir(input: string): string | null {
  const raw = String(input ?? "").trim().replace(/\\/g, "/");
  if (raw === "" || raw === "." || raw === "./") return "";
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) return null;
  const parts = raw.split("/").filter((p) => p !== "" && p !== ".");
  if (parts.some((p) => p === ".." || p.includes("\0"))) return null;
  if (parts.some((p) => HIDDEN_ENTRY_NAMES.has(p))) return null;
  return parts.join("/");
}

export async function listWorkspaceDir(teamDir: string, dir: string): Promise<WorkspaceEntry[]> {
  const rel = normalizeWorkspaceDir(dir);
  if (rel === null) throw new Error("Invalid directory");
  const abs = path.join(teamDir, ...rel.split("/").filter(Boolean));

  const dirents = await fs.readdir(abs, { withFileTypes: true });
  const entries = await Promise.all(
    dirents
      .filter((d) => !HIDDEN_ENTRY_NAMES.has(d.name))
      .map(async (d): Promise<WorkspaceEntry | null> => {
        const relPath = rel ? `${rel}/${d.name}` : d.name;
        // Symlinks are resolved so a link to a directory still browses, but a
        // link pointing outside the workspace is skipped rather than followed.
        let st;
        try {
          st = await fs.stat(path.join(abs, d.name));
        } catch {
          return null;
        }
        if (d.isSymbolicLink()) {
          const real = await fs.realpath(path.join(abs, d.name)).catch(() => "");
          const root = await fs.realpath(teamDir).catch(() => teamDir);
          if (!real.startsWith(root + path.sep) && real !== root) return null;
        }
        if (st.isDirectory()) {
          return { path: relPath, name: d.name, kind: "dir", updatedAtMs: st.mtimeMs };
        }
        if (!st.isFile()) return null;
        return {
          path: relPath,
          name: d.name,
          kind: "file",
          size: st.size,
          updatedAtMs: st.mtimeMs,
          editable: isEditableWorkspaceFile(d.name, st.size),
        };
      }),
  );

  return (entries.filter(Boolean) as WorkspaceEntry[]).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
