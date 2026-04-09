"use client";

import { FileListWithOptionalToggle } from "@/components/FileListWithOptionalToggle";
import type { TeamFileEntry } from "./types";

type TeamFilesTabProps = {
  teamFiles: TeamFileEntry[];
  teamFilesLoading: boolean;
  showOptionalFiles: boolean;
  setShowOptionalFiles: (v: boolean) => void;
  fileName: string;
  fileContent: string;
  setFileContent: (v: string) => void;
  teamFileError: string;
  saving: boolean;
  onLoadTeamFile: (name: string) => void;
  onSaveTeamFile: () => void;
};

export function TeamFilesTab(props: TeamFilesTabProps) {
  const {
    teamFiles,
    teamFilesLoading,
    showOptionalFiles,
    setShowOptionalFiles,
    fileName,
    fileContent,
    setFileContent,
    teamFileError,
    saving,
    onLoadTeamFile,
    onSaveTeamFile,
  } = props;

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <FileListWithOptionalToggle
        title="Team files"
        files={teamFiles}
        loading={teamFilesLoading}
        showOptionalFiles={showOptionalFiles}
        onShowOptionalChange={setShowOptionalFiles}
        selectedFileName={fileName}
        onSelectFile={onLoadTeamFile}
      />

      <div className="ck-card p-4 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Edit: {fileName}</div>
          <button
            disabled={saving}
            onClick={onSaveTeamFile}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save file"}
          </button>
        </div>

        {teamFileError ? (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {teamFileError}
          </div>
        ) : null}

        <textarea
          value={fileContent}
          onChange={(e) => setFileContent(e.target.value)}
          className="mt-3 h-[55vh] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
