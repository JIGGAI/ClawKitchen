export type FileListEntry = {
  name: string;
  missing: boolean;
  required: boolean;
  rationale?: string;
};

export function normalizeFileListEntries(files: unknown[]): FileListEntry[] {
  return files.map((f) => {
    const entry = f as { name?: unknown; missing?: unknown; required?: unknown; rationale?: unknown };
    return {
      name: String(entry.name ?? ""),
      missing: Boolean(entry.missing),
      required: Boolean(entry.required),
      rationale: typeof entry.rationale === "string" ? entry.rationale : undefined,
    };
  });
}
