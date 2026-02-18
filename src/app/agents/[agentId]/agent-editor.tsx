"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { type AgentListItem } from "@/lib/agents";
import { type FileListEntry, normalizeFileListEntries } from "@/lib/editor-utils";
import { errorMessage } from "@/lib/errors";

type FileListResponse = { ok?: boolean; files?: unknown[] };

function DeleteAgentModal({
  open,
  agentId,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  agentId: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[color:var(--ck-bg-glass-strong)] p-5 shadow-[var(--ck-shadow-2)]">
            <div className="text-lg font-semibold text-[color:var(--ck-text-primary)]">Delete agent</div>
            <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
              Delete agent <code className="font-mono">{agentId}</code>? This will remove its workspace/state.
            </p>

            {error ? (
              <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* eslint-disable sonarjs/cognitive-complexity -- component orchestrates many concerns; logic extracted to loadAgentData */
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

  async function loadAgentData() {
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
  }

  useEffect(() => {
    void loadAgentData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

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

  async function onLoadAgentFile(nextName: string) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, agentId, agentFiles.length]);

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
        {activeTab === "identity" ? (
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
        ) : null}

        {activeTab === "config" ? (
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
        ) : null}

        {activeTab === "skills" ? (
          <div className="ck-glass-strong p-4">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Skills</div>
            <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
              Installed skills detected in this agent workspace (<code>skills/</code>).
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
              {skillsList.length ? skillsList.map((s) => <li key={s}>{s}</li>) : <li>None detected.</li>}
            </ul>
            <p className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
              Next: install/uninstall flows.
            </p>
          </div>
        ) : null}

        {activeTab === "files" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="ck-glass-strong p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Agent files</div>
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
                {agentFiles
                  .filter((f) => (showOptionalFiles ? true : Boolean(f.required) || !f.missing))
                  .map((f) => (
                  <li key={f.name}>
                    <button
                      onClick={() => onLoadAgentFile(f.name)}
                      className={
                        fileName === f.name
                          ? "w-full rounded-[var(--ck-radius-sm)] bg-white/10 px-3 py-2 text-left text-sm text-[color:var(--ck-text-primary)]"
                          : "w-full rounded-[var(--ck-radius-sm)] px-3 py-2 text-left text-sm text-[color:var(--ck-text-secondary)] hover:bg-white/5"
                      }
                    >
                      <span className={f.required ? "text-[color:var(--ck-text-primary)]" : "text-[color:var(--ck-text-secondary)]"}>
                        {f.name}
                      </span>
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                        {f.required ? "required" : "optional"}
                      </span>
                      {f.missing ? <span className="ml-2 text-xs text-[color:var(--ck-text-tertiary)]">missing</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

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
        ) : null}

        {message ? (
          <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--ck-text-primary)]">
            {message}
          </div>
        ) : null}
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
