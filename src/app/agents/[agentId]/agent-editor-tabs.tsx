"use client";

import { FileListWithOptionalToggle } from "@/components/FileListWithOptionalToggle";

type FileEntry = { name: string; missing: boolean; required?: boolean; rationale?: string };

export function IdentityTab({
  name,
  emoji,
  theme,
  avatar,
  saving,
  returnTo,
  onNameChange,
  onEmojiChange,
  onThemeChange,
  onAvatarChange,
  onSave,
  router,
}: {
  name: string;
  emoji: string;
  theme: string;
  avatar: string;
  saving: boolean;
  returnTo?: string;
  onNameChange: (v: string) => void;
  onEmojiChange: (v: string) => void;
  onThemeChange: (v: string) => void;
  onAvatarChange: (v: string) => void;
  onSave: () => Promise<void>;
  router: { push: (href: string) => void };
}) {
  return (
    <div className="ck-card p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Identity</div>
      <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Name</label>
      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Emoji</label>
          <input
            value={emoji}
            onChange={(e) => onEmojiChange(e.target.value)}
            placeholder="🦞"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Theme</label>
          <input
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
            placeholder="warm, sharp, calm"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Avatar</label>
          <input
            value={avatar}
            onChange={(e) => onAvatarChange(e.target.value)}
            placeholder="avatars/openclaw.png"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          disabled={saving}
          onClick={onSave}
          className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {returnTo ? (
          <button
            disabled={saving}
            onClick={async () => {
              await onSave();
              router.push(returnTo);
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-50"
          >
            Save & return
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ConfigTab({
  model,
  saving,
  onModelChange,
  onSave,
}: {
  model: string;
  saving: boolean;
  onModelChange: (v: string) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="ck-card p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Config</div>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Thin slice: edit the configured model id for this agent (writes to OpenClaw config).
      </p>
      <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Model</label>
      <input
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        placeholder="openai/gpt-5.2"
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
      />
      <div className="mt-3">
        <button
          disabled={saving}
          onClick={onSave}
          className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save config"}
        </button>
      </div>
    </div>
  );
}

export function SkillsTab({
  agentId,
  skillsList,
  availableSkills,
  skillsLoading,
  selectedSkill,
  installingSkill,
  skillError,
  skillMsg,
  onSelectedSkillChange,
  onInstallSkill,
}: {
  agentId: string;
  skillsList: string[];
  availableSkills: string[];
  skillsLoading: boolean;
  selectedSkill: string;
  installingSkill: boolean;
  skillError: string;
  skillMsg: string;
  onSelectedSkillChange: (v: string) => void;
  onInstallSkill: () => Promise<void>;
}) {
  return (
    <div className="ck-card p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Skills</div>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Skills installed in this <strong>agent</strong> workspace (<code>skills/</code>). If you want a skill available to all agents,
        add it at the team level.
      </p>
      <div className="mt-4">
        <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Installed</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
          {skillsLoading && <li>Loading…</li>}
          {!skillsLoading && skillsList.length > 0 && skillsList.map((s) => <li key={s}>{s}</li>)}
          {!skillsLoading && !skillsList.length && <li>None installed.</li>}
        </ul>
      </div>
      <div className="mt-5 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Add a skill</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selectedSkill}
            onChange={(e) => onSelectedSkillChange(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
            disabled={installingSkill || !availableSkills.length}
          >
            {availableSkills.length ? (
              availableSkills.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))
            ) : (
              <option value="">No skills found</option>
            )}
          </select>
          <button
            type="button"
            disabled={installingSkill || !selectedSkill}
            onClick={() => void onInstallSkill()}
            className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
          >
            {installingSkill ? "Adding…" : "Add"}
          </button>
        </div>
        {skillError && (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {skillError}
          </div>
        )}
        {!skillError && skillMsg && (
          <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            {skillMsg}
          </div>
        )}
        <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
          This uses <code>openclaw recipes install-skill &lt;skill&gt; --agent-id {agentId} --yes</code>.
        </div>
      </div>
    </div>
  );
}

export function FilesTab({
  agentFiles,
  agentFilesLoading,
  showOptionalFiles,
  fileName,
  fileContent,
  loadingFile,
  saving,
  fileError,
  onShowOptionalChange,
  onLoadFile,
  onFileContentChange,
  onSaveFile,
  onCreateMissingFile,
}: {
  agentFiles: FileEntry[];
  agentFilesLoading: boolean;
  showOptionalFiles: boolean;
  fileName: string;
  fileContent: string;
  loadingFile: boolean;
  saving: boolean;
  fileError: string;
  onShowOptionalChange: (v: boolean) => void;
  onLoadFile: (name: string) => void;
  onFileContentChange: (v: string) => void;
  onSaveFile: () => Promise<void>;
  onCreateMissingFile: (name: string) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <FileListWithOptionalToggle
        title="Agent files"
        files={agentFiles}
        loading={agentFilesLoading}
        showOptionalFiles={showOptionalFiles}
        onShowOptionalChange={onShowOptionalChange}
        selectedFileName={fileName}
        onSelectFile={onLoadFile}
        renderItemExtra={(f) =>
          f.missing ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onCreateMissingFile(f.name)}
              className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
            >
              Create
            </button>
          ) : null
        }
      />
      <div className="ck-card p-4 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Edit: {fileName}</div>
          <div className="flex items-center gap-3">
            {loadingFile ? <span className="text-xs text-[color:var(--ck-text-tertiary)]">Loading…</span> : null}
            <button
              disabled={saving}
              onClick={onSaveFile}
              className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save file"}
            </button>
          </div>
        </div>
        {fileError ? (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {fileError}
          </div>
        ) : null}
        <textarea
          value={fileContent}
          onChange={(e) => onFileContentChange(e.target.value)}
          className="mt-3 h-[55vh] w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
