"use client";

export type FileListWithOptionalToggleEntry = {
  name: string;
  missing: boolean;
  required?: boolean;
};

function getFileButtonClass(selectedFileName: string, fName: string): string {
  const isSelected = selectedFileName === fName;
  const base = "w-full rounded-lg px-3 py-2 text-left text-sm";
  if (isSelected) {
    return `${base} bg-white/10 text-[color:var(--ck-text-primary)]`;
  }
  return `${base} text-[color:var(--ck-text-secondary)] hover:bg-white/5`;
}

export function FileListWithOptionalToggle({
  title,
  files,
  loading,
  showOptionalFiles,
  onShowOptionalChange,
  selectedFileName,
  onSelectFile,
  renderItemExtra,
}: {
  title: string;
  files: FileListWithOptionalToggleEntry[];
  loading?: boolean;
  showOptionalFiles: boolean;
  onShowOptionalChange: (v: boolean) => void;
  selectedFileName: string;
  onSelectFile: (name: string) => void;
  renderItemExtra?: (f: FileListWithOptionalToggleEntry) => React.ReactNode;
}) {
  const filtered = showOptionalFiles ? files : files.filter((f) => f.required || !f.missing);

  return (
    <div className="ck-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">{title}</div>
        <label className="flex items-center gap-2 text-xs text-[color:var(--ck-text-secondary)]">
          <input
            type="checkbox"
            checked={showOptionalFiles}
            onChange={(e) => onShowOptionalChange(e.target.checked)}
          />
          Show optional
        </label>
      </div>
      <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
        Default view hides optional missing files to reduce noise.
      </div>
      <ul className="mt-3 space-y-1">
        {loading ? <li className="text-sm text-[color:var(--ck-text-secondary)]">Loading…</li> : null}
        {filtered.map((f) => (
          <li key={f.name}>
            <div className="flex items-center gap-2">
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
              {renderItemExtra?.(f)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
