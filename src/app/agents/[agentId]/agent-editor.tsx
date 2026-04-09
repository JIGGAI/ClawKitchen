"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/errors";
import { fetchAll, fetchJson } from "@/lib/fetch-json";
import { DeleteAgentModal } from "@/components/delete-modals";
import { IdentityTab, ConfigTab, SkillsTab, FilesTab } from "./agent-editor-tabs";

type AgentListItem = {
  id: string;
  identityName?: string;
  workspace?: string;
  model?: string;
  isDefault?: boolean;
};

type FileListResponse = { ok?: boolean; files?: unknown[] };

type FileEntry = { name: string; missing: boolean };

async function loadAgentFilesAndSkills(
  agentId: string,
  setters: {
    setAgentFiles: (f: Array<FileEntry & { required?: boolean; rationale?: string }>) => void;
    setSkillsList: (s: string[]) => void;
    setAvailableSkills: (s: string[]) => void;
    setSelectedSkill: (s: string) => void;
    setAgentFilesLoading: (v: boolean) => void;
    setSkillsLoading: (v: boolean) => void;
  }
): Promise<void> {
  setters.setAgentFilesLoading(true);
  setters.setSkillsLoading(true);
  try {
    const [filesRes, skillsRes, availableSkillsRes] = await fetchAll([
      `/api/agents/files?agentId=${encodeURIComponent(agentId)}`,
      `/api/agents/skills?agentId=${encodeURIComponent(agentId)}`,
      "/api/skills/available",
    ]);

    let installedSkills: string[] = [];
    try {
      const filesJson = (await filesRes.json()) as FileListResponse;
      if (filesRes.ok && filesJson.ok) {
        const files = Array.isArray(filesJson.files) ? filesJson.files : [];
        setters.setAgentFiles(
          files.map((f) => {
            const entry = f as { name?: unknown; missing?: unknown };
            return {
              name: String(entry.name ?? ""),
              missing: Boolean(entry.missing),
              required: Boolean((entry as { required?: unknown }).required),
              rationale:
                typeof (entry as { rationale?: unknown }).rationale === "string"
                  ? ((entry as { rationale?: string }).rationale as string)
                  : undefined,
            };
          }),
        );
      }
    } catch {
      // ignore
    }
    try {
      const skillsJson = (await skillsRes.json()) as { ok?: boolean; skills?: unknown[] };
      if (skillsRes.ok && skillsJson.ok) {
        installedSkills = Array.isArray(skillsJson.skills) ? (skillsJson.skills as string[]) : [];
        setters.setSkillsList(installedSkills);
      }
    } catch {
      // ignore
    }
    try {
      const availableSkillsJson = (await availableSkillsRes.json()) as { ok?: boolean; skills?: unknown[] };
      if (availableSkillsRes.ok && availableSkillsJson.ok) {
        const list = Array.isArray(availableSkillsJson.skills) ? (availableSkillsJson.skills as string[]) : [];
        setters.setAvailableSkills(list);
        const first = list.find((s) => !installedSkills.includes(s));
        setters.setSelectedSkill(first ?? list[0] ?? "");
      }
    } catch {
      // ignore
    }
  } finally {
    setters.setAgentFilesLoading(false);
    setters.setSkillsLoading(false);
  }
}

export default function AgentEditor({ agentId, returnTo, onClose }: { agentId: string; returnTo?: string; onClose?: () => void }) {
  const router = useRouter();
  const [agent, setAgent] = useState<AgentListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  // Split concerns: avoid file-load errors showing up in the Skills notice area.
  const [pageMsg, setPageMsg] = useState<string>("");
  const [fileError, setFileError] = useState<string>("");
  const [skillMsg, setSkillMsg] = useState<string>("");
  const [skillError, setSkillError] = useState<string>("");

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
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string>("");
  const [installingSkill, setInstallingSkill] = useState(false);

  const [agentFiles, setAgentFiles] = useState<Array<FileEntry & { required?: boolean; rationale?: string }>>([]);
  const [agentFilesLoading, setAgentFilesLoading] = useState(false);
  const [showOptionalFiles, setShowOptionalFiles] = useState(false);
  const [fileName, setFileName] = useState<string>("SOUL.md");
  const [fileContent, setFileContent] = useState<string>("");

  const teamId = agentId.includes("-") ? agentId.split("-").slice(0, -1).join("-") : "";

  useEffect(() => {
    (async () => {
      setLoading(true);
      setPageMsg("");
      try {
        const agentsJson = await fetchJson<{ agents?: unknown[] }>("/api/agents", { cache: "no-store" });
        const list = Array.isArray(agentsJson.agents) ? (agentsJson.agents as AgentListItem[]) : [];
        const found = list.find((a) => a.id === agentId) ?? null;
        setAgent(found);
        setName(found?.identityName ?? "");
        setModel(found?.model ?? "");

        setLoading(false);

        void loadAgentFilesAndSkills(agentId, {
          setAgentFiles,
          setSkillsList,
          setAvailableSkills,
          setSelectedSkill,
          setAgentFilesLoading,
          setSkillsLoading,
        });
      } catch (e: unknown) {
        setPageMsg(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  async function withSaveFeedback(
    fn: () => Promise<string>,
  ) {
    setSaving(true);
    setPageMsg("");
    try {
      const msg = await fn();
      setPageMsg(msg);
    } catch (e: unknown) {
      setPageMsg(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveIdentity() {
    await withSaveFeedback(async () => {
      await fetchJson("/api/agents/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, name, emoji, theme, avatar }),
      });
      return "Saved identity via openclaw agents set-identity";
    });
  }

  async function onSaveConfig() {
    await withSaveFeedback(async () => {
      await fetchJson("/api/agents/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, patch: { model } }),
      });
      return "Saved agent config (model) and restarted gateway";
    });
  }

  async function onLoadAgentFile(nextName: string) {
    // Update selection immediately so the UI reflects what the user clicked,
    // even if the network request fails.
    setFileName(nextName);
    setFileContent("");

    setLoadingFile(true);
    setFileError("");
    try {
      const json = await fetchJson<{ ok?: boolean; content?: string }>(
        `/api/agents/file?agentId=${encodeURIComponent(agentId)}&name=${encodeURIComponent(nextName)}`,
        { cache: "no-store" },
      );
      if (!json.ok) throw new Error("Failed to load file");
      setFileContent(String(json.content ?? ""));
    } catch (e: unknown) {
      setFileError(errorMessage(e));
    } finally {
      setLoadingFile(false);
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Load file when entering Files tab; onLoadAgentFile and fileContent intentionally omitted.
  }, [activeTab, agentId, agentFiles.length]);

  function defaultFileContent(name: string) {
    switch (name) {
      case "SOUL.md":
        return "# SOUL.md\n\n";
      case "AGENTS.md":
        return "# AGENTS.md\n\n";
      case "TOOLS.md":
        return "# TOOLS.md\n\n";
      case "STATUS.md":
        return "# STATUS.md\n\n- (empty)\n";
      case "NOTES.md":
        return "# NOTES.md\n\n- (empty)\n";
      case "IDENTITY.md":
        return "# IDENTITY.md\n\n- **Name:**\n- **Creature:**\n- **Vibe:**\n- **Emoji:**\n- **Avatar:**\n";
      case "USER.md":
        return "# USER.md\n\n";
      case "HEARTBEAT.md":
        return "# HEARTBEAT.md\n\n# Keep this file empty (or with only comments) to skip heartbeat API calls.\n";
      default:
        return "";
    }
  }

  async function onSaveAgentFile() {
    setSaving(true);
    setFileError("");
    try {
      const json = await fetchJson<{ ok?: boolean }>("/api/agents/file", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, name: fileName, content: fileContent }),
      });
      if (!json.ok) throw new Error("Failed to save file");

      // Refresh the file list so missing/mtime updates immediately.
      try {
        const j = await fetchJson<{ ok?: boolean; files?: Array<FileEntry & { required?: boolean; rationale?: string }> }>(
          `/api/agents/files?agentId=${encodeURIComponent(agentId)}`,
          { cache: "no-store" },
        );
        if (j.ok && Array.isArray(j.files)) setAgentFiles(j.files);
      } catch {
        // ignore
      }
      // No-op: saving a file doesn't need a global notice.
    } catch (e: unknown) {
      setFileError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onCreateMissingFile(name: string) {
    setFileName(name);
    setFileError("");
    setFileContent(defaultFileContent(name));
    await onSaveAgentFile();
  }

  async function onDeleteAgent() {
    setDeleteBusy(true);
    setDeleteError(null);
    setPageMsg("");

    try {
      await fetchJson(`/api/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });

      window.location.href = "/";
    } catch (e: unknown) {
      setDeleteError(errorMessage(e));
      setDeleteBusy(false);
    }
  }

  // Initial load only gates the minimal state (agent exists). Files/skills stream in.
  if (loading) return <div className="w-full">Loading…</div>;
  if (!agent) return <div className="w-full">Agent not found: {agentId}</div>;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {onClose ? (
            <button type="button" onClick={onClose} className="text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-primary)]" title="Close">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          ) : null}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{agent.identityName || agent.id}</h1>
          <p className="mt-1 text-sm font-mono text-[color:var(--ck-text-tertiary)]">
            {agent.id}
            {agent.isDefault ? " · default" : ""}
            {agent.model ? ` · ${agent.model}` : ""}
          </p>
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setDeleteError(null);
            setDeleteOpen(true);
          }}
          className="rounded-lg border border-[color:rgba(255,59,48,0.45)] bg-[color:rgba(255,59,48,0.08)] px-3 py-2 text-sm font-medium text-[color:var(--ck-accent-red)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[color:rgba(255,59,48,0.12)] disabled:opacity-50"
        >
          Delete agent
        </button>
      </div>
      {agent.workspace ? (
        <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">Workspace: {agent.workspace}</div>
      ) : null}
      {teamId ? <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">Team: {teamId}</div> : null}

      {pageMsg ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--ck-text-primary)]">
          {pageMsg}
        </div>
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
                ? "rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)]"
                : "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] hover:bg-white/10"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4">
        {activeTab === "identity" && (
          <IdentityTab
            name={name}
            emoji={emoji}
            theme={theme}
            avatar={avatar}
            saving={saving}
            returnTo={returnTo}
            onNameChange={setName}
            onEmojiChange={setEmoji}
            onThemeChange={setTheme}
            onAvatarChange={setAvatar}
            onSave={onSaveIdentity}
            router={router}
          />
        )}
        {activeTab === "config" && (
          <ConfigTab
            model={model}
            saving={saving}
            onModelChange={setModel}
            onSave={onSaveConfig}
          />
        )}
        {activeTab === "skills" && (
          <SkillsTab
            agentId={agentId}
            skillsList={skillsList}
            availableSkills={availableSkills}
            skillsLoading={skillsLoading}
            selectedSkill={selectedSkill}
            installingSkill={installingSkill}
            skillError={skillError}
            skillMsg={skillMsg}
            onSelectedSkillChange={setSelectedSkill}
            onInstallSkill={async () => {
              setInstallingSkill(true);
              setSkillMsg("");
              setSkillError("");
              try {
                await fetchJson("/api/agents/skills/install", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ agentId, skill: selectedSkill }),
                });
                setSkillMsg(`Installed skill: ${selectedSkill}`);
                try {
                  const j = await fetchJson<{ ok?: boolean; skills?: string[] }>(
                    `/api/agents/skills?agentId=${encodeURIComponent(agentId)}`,
                    { cache: "no-store" },
                  );
                  if (j.ok && Array.isArray(j.skills)) setSkillsList(j.skills);
                } catch {
                  // ignore
                }
              } catch (e: unknown) {
                setSkillError(errorMessage(e));
              } finally {
                setInstallingSkill(false);
              }
            }}
          />
        )}
        {activeTab === "files" && (
          <FilesTab
            agentFiles={agentFiles}
            agentFilesLoading={agentFilesLoading}
            showOptionalFiles={showOptionalFiles}
            fileName={fileName}
            fileContent={fileContent}
            loadingFile={loadingFile}
            saving={saving}
            fileError={fileError}
            onShowOptionalChange={setShowOptionalFiles}
            onLoadFile={onLoadAgentFile}
            onFileContentChange={setFileContent}
            onSaveFile={onSaveAgentFile}
            onCreateMissingFile={onCreateMissingFile}
          />
        )}
      </div>

      <DeleteAgentModal
        open={deleteOpen}
        agentId={agentId}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void onDeleteAgent()}
      />
    </div>
  );
}
