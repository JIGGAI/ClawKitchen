"use client";

import type { FileListEntry } from "@/lib/editor-utils";

function getFileButtonClass(selectedFileName: string, fName: string): string {
  const isSelected = selectedFileName === fName;
  const base = "w-full rounded-[var(--ck-radius-sm)] px-3 py-2 text-left text-sm";
  if (isSelected) {
    return `${base} bg-white/10 text-[color:var(--ck-text-primary)]`;
  }
  return `${base} text-[color:var(--ck-text-secondary)] hover:bg-white/5`;
}

export function WorkspaceFileListSidebar({
  title,
  files,
  selectedFileName,
  onSelectFile,
  showOptionalFiles,
  setShowOptionalFiles,
}: {
  title: string;
  files: FileListEntry[];
  selectedFileName: string;
  onSelectFile: (name: string) => void;
  showOptionalFiles: boolean;
  setShowOptionalFiles: (v: boolean) => void;
}) {
  const filtered = showOptionalFiles ? files : files.filter((f) => f.required || !f.missing);

  return (
    <div className="ck-glass-strong p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">{title}</div>
        <label className="flex items-center gap-2 text-xs text-[color:var(--ck-text-secondary)]">
          <input
            type="checkbox"
            checked={showOptionalFiles}
            onChange={(e) => setShowOptionalFiles(e.target.checked)}
          />
          Show optional
        </label>
      </div>
      <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
        Default view hides optional missing files to reduce noise.
      </div>
      <ul className="mt-3 space-y-1">
        {filtered.map((f) => (
          <li key={f.name}>
            <button
              type="button"
              onClick={() => onSelectFile(f.name)}
              className={getFileButtonClass(selectedFileName, f.name)}
            >
              <span
                className={
                  f.required ? "text-[color:var(--ck-text-primary)]" : "text-[color:var(--ck-text-secondary)]"
                }
              >
                {f.name}
              </span>
              <span className="ml-2 text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                {f.required ? "required" : "optional"}
              </span>
              {f.missing ? (
                <span className="ml-2 text-xs text-[color:var(--ck-text-tertiary)]">missing</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
