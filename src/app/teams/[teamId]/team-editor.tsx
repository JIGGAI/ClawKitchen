"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type AgentListItem } from "@/lib/agents";
import { cronJobId, cronJobLabel, type CronJobShape } from "@/lib/cron";
import { type FileListEntry, normalizeFileListEntries } from "@/lib/editor-utils";
import { errorMessage } from "@/lib/errors";
import { forceFrontmatterId, type RecipeDetail, type RecipeListItem } from "@/lib/recipes";
import { WorkspaceFileListSidebar } from "@/components/WorkspaceFileListSidebar";
import { CloneTeamModal } from "./CloneTeamModal";
import { DeleteTeamModal } from "./DeleteTeamModal";
import { useToast } from "@/components/ToastProvider";

type FlashKind = "success" | "error" | "info";

function getTabButtonClass(activeTab: string, tabId: string): string {
  const isActive = activeTab === tabId;
  const base = "rounded-[var(--ck-radius-sm)] px-3 py-2 text-sm font-medium shadow-[var(--ck-shadow-1)]";
  if (isActive) {
    return `${base} bg-[var(--ck-accent-red)] text-white`;
  }
  return `${base} border border-white/10 bg-white/5 text-[color:var(--ck-text-primary)] hover:bg-white/10`;
}

async function updateTeamAgents(
  body: { recipeId: string; op: "add" | "remove"; role: string; name?: string },
  successMsg: string,
  ensureRecipe: () => Promise<void>,
  currentContent: string,
  setContent: (c: string) => void,
  flashMessage: (msg: string, type: "success" | "error") => void,
  setSaving: (v: boolean) => void
) {
  setSaving(true);
  try {
    await ensureRecipe();
    const res = await fetch("/api/recipes/team-agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error((json as { error?: string }).error || "Failed updating agents list");
    setContent(String((json as { content?: string }).content ?? currentContent));
    flashMessage(successMsg, "success");
  } catch (e: unknown) {
    flashMessage(errorMessage(e), "error");
  } finally {
    setSaving(false);
  }
}

function applyLockedOrFallback(
  locked: { recipeId: string; recipeName?: string } | null,
  list: RecipeListItem[],
  teamId: string,
  setLockedFromId: (v: string | null) => void,
  setLockedFromName: (v: string | null) => void,
  setProvenanceMissing: (v: boolean) => void,
  setFromId: (v: string) => void
) {
  if (locked) {
    setLockedFromId(locked.recipeId);
    setLockedFromName(locked.recipeName ?? null);
    setProvenanceMissing(false);
    setFromId(locked.recipeId);
  } else {
    setLockedFromId(null);
    setLockedFromName(null);
    setProvenanceMissing(true);
    const preferred = list.find((r) => r.kind === "team" && r.id === teamId);
    const fallback = list.find((r) => r.kind === "team");
    const pick = preferred ?? fallback;
    if (pick) setFromId(pick.id);
  }
}

async function parseMetaForLocked(metaRes: Response): Promise<{ recipeId: string; recipeName?: string } | null> {
  try {
    const metaJson = await metaRes.json();
    if (!metaRes.ok || !metaJson.ok || !metaJson.meta || !(metaJson.meta as { recipeId?: unknown }).recipeId) {
      return null;
    }
    const m = metaJson.meta as { recipeId?: unknown; recipeName?: unknown };
    return {
      recipeId: String(m.recipeId),
      recipeName: typeof m.recipeName === "string" ? m.recipeName : undefined,
    };
  } catch {
    return null;
  }
}

async function loadAncillaryData(
  teamId: string,
  setTeamFiles: React.Dispatch<React.SetStateAction<FileListEntry[]>>,
  setCronJobs: React.Dispatch<React.SetStateAction<unknown[]>>,
  setTeamAgents: React.Dispatch<React.SetStateAction<Pick<AgentListItem, "id" | "identityName">[]>>,
  setSkillsList: React.Dispatch<React.SetStateAction<string[]>>
) {
  const [filesRes, cronRes, agentsRes, skillsRes] = await Promise.all([
    fetch(`/api/teams/files?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
    fetch(`/api/cron/jobs?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
    fetch("/api/agents", { cache: "no-store" }),
    fetch(`/api/teams/skills?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
  ]);

  const filesJson = (await filesRes.json()) as { ok?: boolean; files?: unknown[] };
  if (filesRes.ok && filesJson.ok) {
    const files = Array.isArray(filesJson.files) ? filesJson.files : [];
    setTeamFiles(normalizeFileListEntries(files));
  }

  const cronJson = (await cronRes.json()) as { ok?: boolean; jobs?: unknown[] };
  if (cronRes.ok && cronJson.ok) {
    setCronJobs(Array.isArray(cronJson.jobs) ? cronJson.jobs : []);
  }

  const agentsJson = (await agentsRes.json()) as { agents?: unknown[] };
  if (agentsRes.ok) {
    const all = Array.isArray(agentsJson.agents) ? agentsJson.agents : [];
    const filtered = all.filter((a) => String((a as { id?: unknown }).id ?? "").startsWith(`${teamId}-`));
    setTeamAgents(
      filtered.map((a) => {
        const agent = a as { id?: unknown; identityName?: unknown };
        return { id: String(agent.id ?? ""), identityName: typeof agent.identityName === "string" ? agent.identityName : undefined };
      })
    );
  }

  const skillsJson = await skillsRes.json();
  if (skillsRes.ok && skillsJson.ok) {
    setSkillsList(Array.isArray(skillsJson.skills) ? skillsJson.skills : []);
  }
}

type TeamTabId = "recipe" | "agents" | "skills" | "cron" | "files";

function RecipeTabContent({
  toId,
  setToId,
  toName,
  setToName,
  canEditTargetId,
  fromId,
  setFromId,
  teamRecipes,
  lockedFromId,
  lockedFromName,
  provenanceMissing,
  content,
  setContent,
  loadingSource,
  targetIdValid,
  targetIsBuiltin,
  teamIdValid,
  saving,
  onLoadTeamRecipeMarkdown,
  onSaveCustom,
  setCloneNonce,
  setCloneOpen,
  setDeleteOpen,
}: {
  toId: string;
  setToId: (v: string) => void;
  toName: string;
  setToName: (v: string) => void;
  canEditTargetId: boolean;
  fromId: string;
  setFromId: (v: string) => void;
  teamRecipes: RecipeListItem[];
  lockedFromId: string | null;
  lockedFromName: string | null;
  provenanceMissing: boolean;
  content: string;
  setContent: (v: string) => void;
  loadingSource: boolean;
  targetIdValid: boolean;
  targetIsBuiltin: boolean;
  teamIdValid: boolean;
  saving: boolean;
  onLoadTeamRecipeMarkdown: () => void;
  onSaveCustom: (overwrite: boolean) => void;
  setCloneNonce: (fn: (n: number) => number) => void;
  setCloneOpen: (v: boolean) => void;
  setDeleteOpen: (v: boolean) => void;
}) {
  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Custom recipe target</div>
          <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Team id</label>
          <input
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            disabled={!canEditTargetId}
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] disabled:opacity-70"
          />
          <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
            This is the <b>custom recipe id</b> that will be created/overwritten when you save.
          </div>

          <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">Team name</label>
          <input
            value={toName}
            onChange={(e) => setToName(e.target.value)}
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />

          <div className="mt-4 grid grid-cols-1 gap-2">
            <button
              type="button"
              disabled={loadingSource || !targetIdValid || targetIsBuiltin}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void onLoadTeamRecipeMarkdown();
              }}
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-60"
            >
              {loadingSource ? "Loading…" : "Load team markdown"}
            </button>

            <button
              disabled={saving || !teamIdValid || !targetIdValid || targetIsBuiltin}
              onClick={() => onSaveCustom(true)}
              className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <button
              disabled={saving || !teamIdValid || targetIsBuiltin}
              onClick={() => {
                setCloneNonce((n) => n + 1);
                setCloneOpen(true);
              }}
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-50"
            >
              Clone Team
            </button>

            <button
              disabled={saving}
              onClick={() => setDeleteOpen(true)}
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-50"
            >
              Delete Team
            </button>
          </div>
        </div>

        <div className="ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Notes</div>

          <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Parent recipe (locked)</div>
            <select
              disabled
              className="mt-2 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] disabled:opacity-70"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              {teamRecipes.map((r) => (
                <option key={`${r.source}:${r.id}`} value={r.id}>
                  {r.id} ({r.source})
                </option>
              ))}
            </select>
            {lockedFromId && (
              <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                <code>{lockedFromId}</code>
                {lockedFromName ? ` (${lockedFromName})` : ""}
              </div>
            )}
            {!lockedFromId && provenanceMissing && (
              <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                Provenance not found for this team. The parent recipe above is a best-guess.
              </div>
            )}
          </div>

          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
            <li>
              <strong>Save</strong> writes/overwrites the custom recipe file identified by &quot;Team id&quot;.
            </li>
            <li>
              <strong>Clone Team</strong> creates a new custom recipe copy (fails if it already exists).
            </li>
            <li>
              <strong>Delete Team</strong> runs the safe uninstall command (<code>openclaw recipes remove-team</code>).
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-6 ck-glass-strong p-4">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe markdown</div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="mt-2 h-[55vh] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
          spellCheck={false}
        />
      </div>
    </>
  );
}

function AgentsTabContent({
  toId,
  newRole,
  setNewRole,
  newRoleName,
  setNewRoleName,
  teamAgents,
  saving,
  ensureCustomRecipeExists,
  content,
  setContent,
  flashMessage,
  setSaving,
}: {
  toId: string;
  newRole: string;
  setNewRole: (v: string) => void;
  newRoleName: string;
  setNewRoleName: (v: string) => void;
  teamAgents: Pick<AgentListItem, "id" | "identityName">[];
  saving: boolean;
  ensureCustomRecipeExists: (args: { overwrite: boolean }) => Promise<unknown>;
  content: string;
  setContent: (v: string) => void;
  flashMessage: (msg: string, kind?: FlashKind) => void;
  setSaving: (v: boolean) => void;
}) {
  return (
    <div className="mt-6 ck-glass-strong p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Agents in this team</div>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Thin slice: manage agents by editing the <code>agents:</code> list in your custom team recipe (<code>{toId}</code>).
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Role</label>
          <input
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="lead"
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Name (optional)</label>
          <input
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="Dev Team Lead"
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={saving}
          onClick={() =>
            updateTeamAgents(
              { recipeId: toId.trim(), op: "add", role: newRole, name: newRoleName },
              `Updated agents list in ${toId}`,
              () => ensureCustomRecipeExists({ overwrite: false }),
              content,
              setContent,
              flashMessage,
              setSaving
            )
          }
          className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
        >
          Add / Update role
        </button>
        <button
          disabled={saving}
          onClick={() =>
            updateTeamAgents(
              { recipeId: toId.trim(), op: "remove", role: newRole },
              `Removed role ${newRole} from ${toId}`,
              () => ensureCustomRecipeExists({ overwrite: false }),
              content,
              setContent,
              flashMessage,
              setSaving
            )
          }
          className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] hover:bg-white/10 disabled:opacity-50"
        >
          Remove role
        </button>
      </div>

      <div className="mt-6">
        <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Detected installed team agents (read-only)</div>
        <ul className="mt-2 space-y-2">
          {teamAgents.length ? (
            teamAgents.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[color:var(--ck-text-primary)]">
                    {a.identityName || a.id}
                  </div>
                  <div className="text-xs text-[color:var(--ck-text-secondary)]">{a.id}</div>
                </div>
                <a
                  className="text-sm font-medium text-[color:var(--ck-accent-red)] hover:text-[color:var(--ck-accent-red-hover)]"
                  href={`/agents/${encodeURIComponent(a.id)}`}
                >
                  Edit
                </a>
              </li>
            ))
          ) : (
            <li className="text-sm text-[color:var(--ck-text-secondary)]">No team agents detected.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function SkillsTabContent({ skillsList }: { skillsList: string[] }) {
  return (
    <div className="mt-6 ck-glass-strong p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Installed skills (team workspace)</div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
        {skillsList.length ? skillsList.map((s) => <li key={s}>{s}</li>) : <li>No skills installed.</li>}
      </ul>
    </div>
  );
}

function CronTabContent({
  cronJobs,
  saving,
  setSaving,
  flashMessage,
}: {
  cronJobs: unknown[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  flashMessage: (msg: string, kind?: FlashKind) => void;
}) {
  return (
    <div className="mt-6 ck-glass-strong p-4">
      <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Cron jobs (filtered by team name)</div>
      <ul className="mt-3 space-y-3">
        {cronJobs.length ? (
          cronJobs.map((j) => (
            <CronJobListItem
              key={cronJobId(j) || cronJobLabel(j) || "job"}
              job={j}
              saving={saving}
              setSaving={setSaving}
              flashMessage={flashMessage}
            />
          ))
        ) : (
          <li className="text-sm text-[color:var(--ck-text-secondary)]">No cron jobs detected for this team.</li>
        )}
      </ul>
    </div>
  );
}

function FilesTabContent({
  teamFiles,
  fileName,
  fileContent,
  setFileContent,
  showOptionalFiles,
  setShowOptionalFiles,
  saving,
  onLoadTeamFile,
  onSaveTeamFile,
}: {
  teamFiles: FileListEntry[];
  fileName: string;
  fileContent: string;
  setFileContent: (v: string) => void;
  showOptionalFiles: boolean;
  setShowOptionalFiles: (v: boolean) => void;
  saving: boolean;
  onLoadTeamFile: (name: string) => void;
  onSaveTeamFile: () => void;
}) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <WorkspaceFileListSidebar
        title="Team files"
        files={teamFiles}
        selectedFileName={fileName}
        onSelectFile={onLoadTeamFile}
        showOptionalFiles={showOptionalFiles}
        setShowOptionalFiles={setShowOptionalFiles}
      />

      <div className="ck-glass-strong p-4 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Edit: {fileName}</div>
          <button
            disabled={saving}
            onClick={onSaveTeamFile}
            className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save file"}
          </button>
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

function renderTeamTabPanel(
  activeTab: TeamTabId,
  state: {
    toId: string;
    setToId: (v: string) => void;
    toName: string;
    setToName: (v: string) => void;
    canEditTargetId: boolean;
    fromId: string;
    setFromId: (v: string) => void;
    teamRecipes: RecipeListItem[];
    lockedFromId: string | null;
    lockedFromName: string | null;
    provenanceMissing: boolean;
    content: string;
    setContent: (v: string) => void;
    loadingSource: boolean;
    targetIdValid: boolean;
    targetIsBuiltin: boolean;
    teamIdValid: boolean;
    saving: boolean;
    onLoadTeamRecipeMarkdown: () => void;
    onSaveCustom: (overwrite: boolean) => void;
    setCloneNonce: (fn: (n: number) => number) => void;
    setCloneOpen: (v: boolean) => void;
    setDeleteOpen: (v: boolean) => void;
    newRole: string;
    setNewRole: (v: string) => void;
    newRoleName: string;
    setNewRoleName: (v: string) => void;
    teamAgents: Pick<AgentListItem, "id" | "identityName">[];
    ensureCustomRecipeExists: (args: { overwrite: boolean }) => Promise<unknown>;
    flashMessage: (msg: string, kind?: FlashKind) => void;
    setSaving: (v: boolean) => void;
    skillsList: string[];
    cronJobs: unknown[];
    teamFiles: FileListEntry[];
    fileName: string;
    fileContent: string;
    setFileContent: (v: string) => void;
    showOptionalFiles: boolean;
    setShowOptionalFiles: (v: boolean) => void;
    onLoadTeamFile: (name: string) => void;
    onSaveTeamFile: () => void;
  }
) {
  switch (activeTab) {
    case "recipe":
      return (
        <RecipeTabContent
          toId={state.toId}
          setToId={state.setToId}
          toName={state.toName}
          setToName={state.setToName}
          canEditTargetId={state.canEditTargetId}
          fromId={state.fromId}
          setFromId={state.setFromId}
          teamRecipes={state.teamRecipes}
          lockedFromId={state.lockedFromId}
          lockedFromName={state.lockedFromName}
          provenanceMissing={state.provenanceMissing}
          content={state.content}
          setContent={state.setContent}
          loadingSource={state.loadingSource}
          targetIdValid={state.targetIdValid}
          targetIsBuiltin={state.targetIsBuiltin}
          teamIdValid={state.teamIdValid}
          saving={state.saving}
          onLoadTeamRecipeMarkdown={state.onLoadTeamRecipeMarkdown}
          onSaveCustom={state.onSaveCustom}
          setCloneNonce={state.setCloneNonce}
          setCloneOpen={state.setCloneOpen}
          setDeleteOpen={state.setDeleteOpen}
        />
      );
    case "agents":
      return (
        <AgentsTabContent
          toId={state.toId}
          newRole={state.newRole}
          setNewRole={state.setNewRole}
          newRoleName={state.newRoleName}
          setNewRoleName={state.setNewRoleName}
          teamAgents={state.teamAgents}
          saving={state.saving}
          ensureCustomRecipeExists={state.ensureCustomRecipeExists}
          content={state.content}
          setContent={state.setContent}
          flashMessage={state.flashMessage}
          setSaving={state.setSaving}
        />
      );
    case "skills":
      return <SkillsTabContent skillsList={state.skillsList} />;
    case "cron":
      return (
        <CronTabContent
          cronJobs={state.cronJobs}
          saving={state.saving}
          setSaving={state.setSaving}
          flashMessage={state.flashMessage}
        />
      );
    case "files":
      return (
        <FilesTabContent
          teamFiles={state.teamFiles}
          fileName={state.fileName}
          fileContent={state.fileContent}
          setFileContent={state.setFileContent}
          showOptionalFiles={state.showOptionalFiles}
          setShowOptionalFiles={state.setShowOptionalFiles}
          saving={state.saving}
          onLoadTeamFile={state.onLoadTeamFile}
          onSaveTeamFile={state.onSaveTeamFile}
        />
      );
    default:
      return null;
  }
}

function CronJobListItem({
  job,
  saving,
  setSaving,
  flashMessage,
}: {
  job: unknown;
  saving: boolean;
  setSaving: (v: boolean) => void;
  flashMessage: (msg: string, kind?: FlashKind) => void;
}) {
  const j = job as CronJobShape;
  const id = cronJobId(j);
  const label = cronJobLabel(j);
  const enabled = j.enabled ?? j.state?.enabled;

  async function onCronAction(action: "enable" | "disable" | "run") {
    setSaving(true);
    try {
      const res = await fetch("/api/cron/job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Cron action failed");
      flashMessage(`Cron ${action}: ${label}`, "success");
    } catch (e: unknown) {
      flashMessage(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
      <div className="font-medium text-[color:var(--ck-text-primary)]">{label}</div>
      <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">Enabled: {String(enabled ?? "?")}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          disabled={saving || !id}
          onClick={() => onCronAction("run")}
          className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
        >
          Run
        </button>
        <button
          disabled={saving || !id}
          onClick={() => onCronAction("enable")}
          className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
        >
          Enable
        </button>
        <button
          disabled={saving || !id}
          onClick={() => onCronAction("disable")}
          className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
        >
          Disable
        </button>
        {!id ? <div className="text-xs text-[color:var(--ck-text-tertiary)]">(missing id)</div> : null}
      </div>
    </li>
  );
}

export default function TeamEditor({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [fromId, setFromId] = useState<string>("");
  const [lockedFromId, setLockedFromId] = useState<string | null>(null);
  const [lockedFromName, setLockedFromName] = useState<string | null>(null);
  const [provenanceMissing, setProvenanceMissing] = useState(false);
  const [toId, setToId] = useState<string>(teamId);
  const [toName, setToName] = useState<string>(teamId);
  const [content, setContent] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"recipe" | "agents" | "skills" | "cron" | "files">("recipe");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const toast = useToast();

  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneNonce, setCloneNonce] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const flashMessage = useCallback(
    (next: string, kind: FlashKind = "info") => {
      const msg = String(next ?? "").trim();
      if (!msg) return;
      toast.push({ kind, message: msg });
    },
    [toast]
  );

  const [teamFiles, setTeamFiles] = useState<FileListEntry[]>([]);
  const [showOptionalFiles, setShowOptionalFiles] = useState(false);
  const [fileName, setFileName] = useState<string>("SOUL.md");
  const [fileContent, setFileContent] = useState<string>("");
  const [cronJobs, setCronJobs] = useState<unknown[]>([]);
  const [teamAgents, setTeamAgents] = useState<Pick<AgentListItem, "id" | "identityName">[]>([]);
  const [newRole, setNewRole] = useState<string>("");
  const [newRoleName, setNewRoleName] = useState<string>("");
  const [skillsList, setSkillsList] = useState<string[]>([]);

  const teamRecipes = useMemo(() => recipes.filter((r) => r.kind === "team"), [recipes]);

  const toRecipe = useMemo(() => {
    // Prefer the workspace recipe when both builtin + workspace exist for the same id.
    const ws = recipes.find((r) => r.id === toId && r.source === "workspace");
    return ws ?? recipes.find((r) => r.id === toId) ?? null;
  }, [recipes, toId]);

  const teamIdValid = Boolean(teamId.trim());
  const targetIdValid = Boolean(toId.trim());
  const hasWorkspaceOverride = recipes.some((r) => r.id === toId && r.source === "workspace");
  const targetIsBuiltin = Boolean(toRecipe?.source === "builtin" && !hasWorkspaceOverride);
  // The "Recipe id" field is the workspace recipe id target.
  // It should be editable, and we must not auto-prefix/modify what the user types.
  const canEditTargetId = true;

  // Initialize defaults whenever we navigate to a new team.
  useEffect(() => {
    setToId(teamId);
    setToName(teamId);
  }, [teamId]);

  const loadTeamData = useCallback(async () => {
    setLoading(true);
    try {
      const [recipesRes, metaRes] = await Promise.all([
        fetch("/api/recipes", { cache: "no-store" }),
        fetch(`/api/teams/meta?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
      ]);

      const json = await recipesRes.json();
      const list = (json.recipes ?? []) as RecipeListItem[];
      setRecipes(list);

      const locked = await parseMetaForLocked(metaRes);
      applyLockedOrFallback(locked, list, teamId, setLockedFromId, setLockedFromName, setProvenanceMissing, setFromId);

      await loadAncillaryData(teamId, setTeamFiles, setCronJobs, setTeamAgents, setSkillsList);
    } catch (e: unknown) {
      flashMessage(errorMessage(e), "error");
    } finally {
      setLoading(false);
    }
  }, [teamId, flashMessage]);

  useEffect(() => {
    void loadTeamData();
  }, [loadTeamData]);

  async function onLoadTeamRecipeMarkdown() {
    const id = toId.trim();
    if (!id) return;
    setLoadingSource(true);
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        // Usually means the workspace recipe doesn't exist yet.
        throw new Error(json.error || `Recipe not found: ${id}. Save or Clone first to create it.`);
      }
      const r = json.recipe as RecipeDetail;
      setContent(r.content);
      flashMessage(`Loaded team recipe: ${r.id}`, "success");
    } catch (e: unknown) {
      flashMessage(errorMessage(e), "error");
    } finally {
      setLoadingSource(false);
    }
  }

  async function ensureCustomRecipeExists(args: { overwrite: boolean; toId?: string; toName?: string; scaffold?: boolean }) {
    const f = fromId.trim();
    const id = String(args.toId ?? toId).trim();
    const name = String(args.toName ?? toName).trim();
    const overwrite = Boolean(args.overwrite);
    const scaffold = Boolean(args.scaffold);

    if (!f) throw new Error("Source recipe id is required");
    if (!id) throw new Error("Custom recipe id is required");

    const res = await fetch("/api/recipes/clone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromId: f, toId: id, toName: name || undefined, overwrite, scaffold }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    return json as { filePath: string; content: string; scaffold?: { ok: boolean; error?: string } | null };
  }

  async function onSaveCustom(overwrite: boolean, overrides?: { toId?: string; toName?: string; scaffold?: boolean }) {
    setSaving(true);
    flashMessage("");
    try {
      const json = await ensureCustomRecipeExists({ overwrite, ...overrides });

      if (json.scaffold && !json.scaffold.ok) {
        flashMessage(`Scaffold failed (recipe was still cloned): ${json.scaffold.error || "Unknown error"}`, "error");
      }

      // If the user has edited the markdown, "Save (overwrite)" should persist both
      // the updated name (frontmatter) and the edited markdown.
      const hasEdits = Boolean(content.trim()) && content.trim() !== json.content.trim();

      if (hasEdits) {
        const nextContent = forceFrontmatterId(content, toId.trim());
        const res = await fetch(`/api/recipes/${encodeURIComponent(toId.trim())}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: nextContent }),
        });
        const putJson = await res.json();
        if (!res.ok) throw new Error(putJson.error || "Save failed");
        setContent(nextContent);
      } else {
        setContent(json.content);
      }

      flashMessage(`Saved team recipe: ${json.filePath}`, "success");
    } catch (e: unknown) {
      const raw = errorMessage(e);
      flashMessage(raw, "error");
    } finally {
      setSaving(false);
    }
  }

  async function onLoadTeamFile(name: string) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/teams/file?teamId=${encodeURIComponent(teamId)}&name=${encodeURIComponent(name)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load file");
      setFileName(name);
      setFileContent(String(json.content ?? ""));
    } catch (e: unknown) {
      flashMessage(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTeamFile() {
    setSaving(true);
    try {
      const res = await fetch("/api/teams/file", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, name: fileName, content: fileContent }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save file");
      flashMessage(`Saved ${fileName}`, "success");
    } catch (e: unknown) {
      flashMessage(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="ck-glass mx-auto max-w-4xl p-6">Loading…</div>;

  return (
    <div className="ck-glass mx-auto max-w-6xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Team editor</h1>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Bootstrap a <strong>custom team recipe</strong> for this installed team, without modifying builtin recipes.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            { id: "recipe", label: "Recipe" },
            { id: "agents", label: "Agents" },
            { id: "skills", label: "Skills" },
            { id: "cron", label: "Cron" },
            { id: "files", label: "Files" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={getTabButtonClass(activeTab, t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {renderTeamTabPanel(activeTab, {
        toId,
        setToId,
        toName,
        setToName,
        canEditTargetId,
        fromId,
        setFromId,
        teamRecipes,
        lockedFromId,
        lockedFromName,
        provenanceMissing,
        content,
        setContent,
        loadingSource,
        targetIdValid,
        targetIsBuiltin,
        teamIdValid,
        saving,
        onLoadTeamRecipeMarkdown,
        onSaveCustom,
        setCloneNonce,
        setCloneOpen,
        setDeleteOpen,
        newRole,
        setNewRole,
        newRoleName,
        setNewRoleName,
        teamAgents,
        ensureCustomRecipeExists,
        flashMessage,
        setSaving,
        skillsList,
        cronJobs,
        teamFiles,
        fileName,
        fileContent,
        setFileContent,
        showOptionalFiles,
        setShowOptionalFiles,
        onLoadTeamFile,
        onSaveTeamFile,
      })}

      <CloneTeamModal
        key={cloneNonce}
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        recipes={recipes}
        onConfirm={async ({ id, name, scaffold }) => {
          setCloneOpen(false);
          // Set the target fields for UI, but DO NOT rely on them for the clone.
          // Clone must use the modal-provided id/name.
          setToId(id);
          setToName(name);
          await onSaveCustom(false, { toId: id, toName: name, scaffold });
        }}
      />

      <DeleteTeamModal
        open={deleteOpen}
        teamId={teamId}
        busy={saving}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          setSaving(true);
          try {
            const res = await fetch("/api/teams/remove-team", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ teamId }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || "Delete failed");
            flashMessage("Deleted team successfully", "success");
            setDeleteOpen(false);
            setTimeout(() => router.push("/"), 250);
          } catch (e: unknown) {
            flashMessage(errorMessage(e), "error");
          } finally {
            setSaving(false);
          }
        }}
      />

    </div>
  );
}
