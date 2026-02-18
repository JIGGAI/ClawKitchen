"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { WorkspaceFileListSidebar } from "@/components/WorkspaceFileListSidebar";
import { type AgentListItem } from "@/lib/agents";
import { type FileListEntry, normalizeFileListEntries } from "@/lib/editor-utils";
import { errorMessage } from "@/lib/errors";

type FileListResponse = { ok?: boolean; files?: unknown[] };

type IdentityTabProps = {
  name: string;
  setName: (v: string) => void;
  emoji: string;
  setEmoji: (v: string) => void;
  theme: string;
  setTheme: (v: string) => void;
  avatar: string;
  setAvatar: (v: string) => void;
  saveAsNewId: string;
  setSaveAsNewId: (v: string) => void;
  saving: boolean;
  agentId: string;
  onSaveIdentity: () => void;
  onSaveAsNew: () => void;
};

function IdentityTabContent(props: IdentityTabProps) {
  const {
    name,
    setName,
    emoji,
    setEmoji,
    theme,
    setTheme,
    avatar,
    setAvatar,
    saveAsNewId,
    setSaveAsNewId,
    saving,
    agentId,
    onSaveIdentity,
    onSaveAsNew,
  } = props;
  return (
    <div className="ck-glass-strong p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Identity</div>

      <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
      />

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Emoji</label>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🦞"
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Theme</label>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="warm, sharp, calm"
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Avatar</label>
          <input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="avatars/openclaw.png"
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          disabled={saving}
          onClick={onSaveIdentity}
          className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
        <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Save As New (new agent id)</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={saveAsNewId}
            onChange={(e) => setSaveAsNewId(e.target.value)}
            placeholder={`${agentId}-copy`}
            className="w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
          <button
            disabled={saving}
            onClick={onSaveAsNew}
            className="shrink-0 rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save As New"}
          </button>
        </div>
        <p className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
          This adds a new agent entry to OpenClaw config and restarts the gateway.
        </p>
      </div>
    </div>
  );
}

function ConfigTabContent({
  model,
  setModel,
  saving,
  onSaveConfig,
}: {
  model: string;
  setModel: (v: string) => void;
  saving: boolean;
  onSaveConfig: () => void;
}) {
  return (
    <div className="ck-glass-strong p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Config</div>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Thin slice: edit the configured model id for this agent (writes to OpenClaw config).
      </p>
      <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Model</label>
      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder="openai/gpt-5.2"
        className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
      />
      <div className="mt-3">
        <button
          disabled={saving}
          onClick={onSaveConfig}
          className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save config"}
        </button>
      </div>
    </div>
  );
}

function SkillsTabContent({ skillsList }: { skillsList: string[] }) {
  return (
    <div className="ck-glass-strong p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Skills</div>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Installed skills detected in this agent workspace (<code>skills/</code>).
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
        {skillsList.length ? skillsList.map((s) => <li key={s}>{s}</li>) : <li>None detected.</li>}
      </ul>
      <p className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">Next: install/uninstall flows.</p>
    </div>
  );
}

function FilesTabContent({
  agentFiles,
  fileName,
  fileContent,
  setFileContent,
  showOptionalFiles,
  setShowOptionalFiles,
  loadingFile,
  saving,
  onLoadAgentFile,
  onSaveAgentFile,
}: {
  agentFiles: FileListEntry[];
  fileName: string;
  fileContent: string;
  setFileContent: (v: string) => void;
  showOptionalFiles: boolean;
  setShowOptionalFiles: (v: boolean) => void;
  loadingFile: boolean;
  saving: boolean;
  onLoadAgentFile: (name: string) => void;
  onSaveAgentFile: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <WorkspaceFileListSidebar
        title="Agent files"
        files={agentFiles}
        selectedFileName={fileName}
        onSelectFile={onLoadAgentFile}
        showOptionalFiles={showOptionalFiles}
        setShowOptionalFiles={setShowOptionalFiles}
      />

      <div className="ck-glass-strong p-4 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Edit: {fileName}</div>
          <div className="flex items-center gap-3">
            {loadingFile ? (
              <span className="text-xs text-[color:var(--ck-text-tertiary)]">Loading…</span>
            ) : null}
            <button
              disabled={saving}
              onClick={onSaveAgentFile}
              className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save file"}
            </button>
          </div>
        </div>
        <textarea
          value={fileContent}
          onChange={(e) => setFileContent(e.target.value)}
          className="mt-3 h-[55vh] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

type AgentTabId = "identity" | "config" | "skills" | "files";

function renderAgentTabPanel(
  activeTab: AgentTabId,
  state: IdentityTabProps & {
    model: string;
    setModel: (v: string) => void;
    skillsList: string[];
    agentFiles: FileListEntry[];
    fileName: string;
    fileContent: string;
    setFileContent: (v: string) => void;
    showOptionalFiles: boolean;
    setShowOptionalFiles: (v: boolean) => void;
    loadingFile: boolean;
    onSaveConfig: () => void;
    onLoadAgentFile: (name: string) => void;
    onSaveAgentFile: () => void;
  }
) {
  switch (activeTab) {
    case "identity":
      return (
        <IdentityTabContent
          name={state.name}
          setName={state.setName}
          emoji={state.emoji}
          setEmoji={state.setEmoji}
          theme={state.theme}
          setTheme={state.setTheme}
          avatar={state.avatar}
          setAvatar={state.setAvatar}
          saveAsNewId={state.saveAsNewId}
          setSaveAsNewId={state.setSaveAsNewId}
          saving={state.saving}
          agentId={state.agentId}
          onSaveIdentity={state.onSaveIdentity}
          onSaveAsNew={state.onSaveAsNew}
        />
      );
    case "config":
      return (
        <ConfigTabContent
          model={state.model}
          setModel={state.setModel}
          saving={state.saving}
          onSaveConfig={state.onSaveConfig}
        />
      );
    case "skills":
      return <SkillsTabContent skillsList={state.skillsList} />;
    case "files":
      return (
        <FilesTabContent
          agentFiles={state.agentFiles}
          fileName={state.fileName}
          fileContent={state.fileContent}
          setFileContent={state.setFileContent}
          showOptionalFiles={state.showOptionalFiles}
          setShowOptionalFiles={state.setShowOptionalFiles}
          loadingFile={state.loadingFile}
          saving={state.saving}
          onLoadAgentFile={state.onLoadAgentFile}
          onSaveAgentFile={state.onSaveAgentFile}
        />
      );
    default:
      return null;
  }
}

export default function AgentEditor({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<AgentListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [message, setMessage] = useState<string>("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"identity" | "config" | "skills" | "files">("identity");

  const [name, setName] = useState<string>("");
  const [emoji, setEmoji] = useState<string>("");
  const [theme, setTheme] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("");

  const [model, setModel] = useState<string>("");

  const [skillsList, setSkillsList] = useState<string[]>([]);

  const [agentFiles, setAgentFiles] = useState<FileListEntry[]>([]);
  const [showOptionalFiles, setShowOptionalFiles] = useState(false);
  const [fileName, setFileName] = useState<string>("IDENTITY.md");
  const [fileContent, setFileContent] = useState<string>("");

  const [saveAsNewId, setSaveAsNewId] = useState<string>("");

  const loadAgentData = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [agentsRes, filesRes, skillsRes] = await Promise.all([
        fetch("/api/agents", { cache: "no-store" }),
        fetch(`/api/agents/files?agentId=${encodeURIComponent(agentId)}`, { cache: "no-store" }),
        fetch(`/api/agents/skills?agentId=${encodeURIComponent(agentId)}`, { cache: "no-store" }),
      ]);

      const agentsJson = (await agentsRes.json()) as { agents?: unknown[] };
      const list = Array.isArray(agentsJson.agents) ? (agentsJson.agents as AgentListItem[]) : [];
      const found = list.find((a) => a.id === agentId) ?? null;
      setAgent(found);
      setName(found?.identityName ?? "");
      setModel(found?.model ?? "");

      const filesJson = (await filesRes.json()) as FileListResponse;
      if (filesRes.ok && filesJson.ok) {
        const files = Array.isArray(filesJson.files) ? filesJson.files : [];
        setAgentFiles(normalizeFileListEntries(files));
      }

      const skillsJson = (await skillsRes.json()) as { ok?: boolean; skills?: unknown[] };
      if (skillsRes.ok && skillsJson.ok) {
        setSkillsList(Array.isArray(skillsJson.skills) ? (skillsJson.skills as string[]) : []);
      }
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadAgentData();
  }, [loadAgentData]);

  async function onSaveIdentity() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/agents/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, name, emoji, theme, avatar }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.message || json.error || "Save failed");
      setMessage("Saved identity via openclaw agents set-identity");
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveConfig() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/agents/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, patch: { model } }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Save config failed");
      setMessage("Saved agent config (model) and restarted gateway");
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAsNew() {
    const newAgentId = saveAsNewId.trim();
    if (!newAgentId) return setMessage("New agent id is required");

    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/agents/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newAgentId, name, emoji, theme, avatar, model: agent?.model }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.message || json.error || "Save As New failed");
      setMessage(`Created new agent: ${newAgentId}`);
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const onLoadAgentFile = useCallback(async (nextName: string) => {
    setLoadingFile(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/agents/file?agentId=${encodeURIComponent(agentId)}&name=${encodeURIComponent(nextName)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string; content?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load file");
      setFileName(nextName);
      setFileContent(String(json.content ?? ""));
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setLoadingFile(false);
    }
  }, [agentId]);

  // When entering the Files tab, load the current file immediately (default: IDENTITY.md).
  useEffect(() => {
    if (activeTab !== "files") return;
    if (!agentFiles.length) return;

    const exists = agentFiles.some((f) => f.name === fileName);
    const fallback = agentFiles[0]?.name;
    const target = exists ? fileName : fallback;
    if (!target) return;

    if (target !== fileName) {
      setFileName(target);
      setFileContent("");
    }

    if (!fileContent) {
      onLoadAgentFile(target);
    }
  }, [activeTab, agentId, agentFiles, fileName, fileContent, onLoadAgentFile]);

  async function onSaveAgentFile() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/agents/file", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, name: fileName, content: fileContent }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save file");
      setMessage(`Saved ${fileName}`);
    } catch (e: unknown) {
      setMessage(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteAgent() {
    setDeleteBusy(true);
    setDeleteError(null);
    setMessage("");

    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string; stderr?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || json.message || json.stderr || "Delete failed");

      window.location.href = "/";
    } catch (e: unknown) {
      setDeleteError(errorMessage(e));
      setDeleteBusy(false);
    }
  }

  if (loading) return <div className="ck-glass mx-auto max-w-4xl p-6">Loading…</div>;
  if (!agent) return <div className="ck-glass mx-auto max-w-4xl p-6">Agent not found: {agentId}</div>;

  return (
    <div className="ck-glass mx-auto max-w-4xl p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent editor</h1>
          <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">
            {agent.id}
            {agent.isDefault ? " • default" : ""}
            {agent.model ? ` • ${agent.model}` : ""}
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          className="rounded-[var(--ck-radius-sm)] border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 shadow-[var(--ck-shadow-1)] hover:bg-red-500/15 disabled:opacity-50"
        >
          Delete agent
        </button>
      </div>
      {agent.workspace ? (
        <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">Workspace: {agent.workspace}</div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            { id: "identity", label: "Identity" },
            { id: "config", label: "Config" },
            { id: "skills", label: "Skills" },
            { id: "files", label: "Files" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={
              activeTab === t.id
                ? "rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)]"
                : "rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] hover:bg-white/10"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4">
        {renderAgentTabPanel(activeTab, {
          name,
          setName,
          emoji,
          setEmoji,
          theme,
          setTheme,
          avatar,
          setAvatar,
          saveAsNewId,
          setSaveAsNewId,
          model,
          setModel,
          skillsList,
          agentFiles,
          fileName,
          fileContent,
          setFileContent,
          showOptionalFiles,
          setShowOptionalFiles,
          loadingFile,
          saving,
          agentId,
          onSaveIdentity,
          onSaveConfig,
          onSaveAsNew,
          onLoadAgentFile,
          onSaveAgentFile,
        })}

        {message ? (
          <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--ck-text-primary)]">
            {message}
          </div>
        ) : null}
      </div>

      <ConfirmationModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete agent"
        confirmLabel="Delete"
        confirmBusyLabel="Deleting…"
        onConfirm={() => void onDeleteAgent()}
        busy={deleteBusy}
        error={deleteError}
      >
        <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
          Delete agent <code className="font-mono">{agentId}</code>? This will remove its workspace/state.
        </p>
      </ConfirmationModal>
    </div>
  );
}
