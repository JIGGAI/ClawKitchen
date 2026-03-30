"use client";

import { useEffect, useMemo, useState } from "react";
import { parse as parseYaml } from "yaml";
import { useRouter } from "next/navigation";
import { DeleteTeamModal } from "@/components/delete-modals";
import { PublishChangesModal } from "../PublishChangesModal";
import { useToast } from "@/components/ToastProvider";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import {
  loadTeamEditorInitial,
  handleAddAgentToTeam,
} from "./team-editor-data";
import { forceFrontmatterId, forceFrontmatterTeamTeamId } from "./team-editor-utils";
import type { RecipeDetail, RecipeListItem, TeamAgentEntry } from "./types";
import { TeamRecipeTab } from "./TeamRecipeTab";
import { TeamAgentsTab } from "./TeamAgentsTab";
import { TeamSkillsTab } from "./TeamSkillsTab";
import { TeamCronTab } from "./TeamCronTab";
import { TeamFilesTab } from "./TeamFilesTab";
import { TeamMemoryTab } from "./TeamMemoryTab";
import { OrchestratorPanel } from "../OrchestratorPanel";
import WorkflowsClient from "../workflows/workflows-client";

import { DeliverablesTab } from "./DeliverablesTab";

const BASE_TABS = [
  { id: "recipe" as const, label: "Recipe" },
  { id: "agents" as const, label: "Agents" },
  { id: "skills" as const, label: "Skills" },
  { id: "cron" as const, label: "Cron" },
  { id: "files" as const, label: "Files" },
  { id: "orchestrator" as const, label: "Orchestrator" },
  // { id: "plugins" as const, label: "Plugins" }, // Not ready for production
] as const;

const EXPERIMENTAL_TABS = [
  { id: "memory" as const, label: "Memory" },
  { id: "workflows" as const, label: "Workflows" },
  { id: "deliverables" as const, label: "Deliverables" },
] as const;


type TabId = (typeof BASE_TABS | typeof EXPERIMENTAL_TABS)[number]["id"];

export default function TeamEditor({ teamId, initialTab }: { teamId: string; initialTab?: string }) {
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [fromId, setFromId] = useState<string>("");
  const [lockedFromId, setLockedFromId] = useState<string | null>(null);
  const [lockedFromName, setLockedFromName] = useState<string | null>(null);
  const [provenanceMissing, setProvenanceMissing] = useState(false);
  const [toId, setToId] = useState<string>(teamId);
  const [toName, setToName] = useState<string>(teamId);
  const [content, setContent] = useState<string>("");
  const [loadedRecipeHash, setLoadedRecipeHash] = useState<string | null>(null);

  // Must be declared BEFORE any hook initializers that reference it.
  // (Avoids SSR/minifier TDZ issues like "Cannot access before initialization".)

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const valid: TabId[] = ["recipe", "agents", "skills", "cron", "files", "memory", "orchestrator", "workflows"]; // removed plugins
    return valid.includes(initialTab as TabId) ? (initialTab as TabId) : "recipe";
  });
  const tabs = useMemo(() => [...BASE_TABS, ...EXPERIMENTAL_TABS], []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [recipeLoadError, setRecipeLoadError] = useState<string>("");
  const toast = useToast();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [teamMetaRecipeHash, setTeamMetaRecipeHash] = useState<string | null>(null);

  function flashMessage(next: string, kind: "success" | "error" | "info" = "info") {
    const msg = String(next ?? "").trim();
    if (!msg) return;
    toast.push({ kind, message: msg });
  }

  const [teamFiles, setTeamFiles] = useState<{ name: string; missing: boolean; required?: boolean; rationale?: string }[]>([]);
  const [teamFilesLoading, setTeamFilesLoading] = useState(false);
  const [teamFileError, setTeamFileError] = useState<string>("");
  const [showOptionalFiles, setShowOptionalFiles] = useState(false);
  const [fileName, setFileName] = useState<string>("SOUL.md");
  const [fileContent, setFileContent] = useState<string>("");

  const [cronJobs, setCronJobs] = useState<unknown[]>([]);
  const [cronLoading, setCronLoading] = useState(false);

  const [teamAgents, setTeamAgents] = useState<TeamAgentEntry[]>([]);
  const [teamAgentsLoading, setTeamAgentsLoading] = useState(false);
  


  const recipeAgents = useMemo(() => {
    const md = String(content ?? "");
    if (!md.startsWith("---\n")) return [] as Array<{ role: string; name?: string }>;
    const end = md.indexOf("\n---\n", 4);
    if (end === -1) return [] as Array<{ role: string; name?: string }>;
    const fmText = md.slice(4, end + 1);
    try {
      const fm = (parseYaml(fmText) ?? {}) as { agents?: unknown };
      const agents = Array.isArray(fm.agents) ? fm.agents : [];
      return agents
        .map((a) => a as { role?: unknown; name?: unknown })
        .map((a) => ({ role: String(a.role ?? "").trim(), name: typeof a.name === "string" ? a.name : undefined }))
        .filter((a) => Boolean(a.role));
    } catch {
      return [] as Array<{ role: string; name?: string }>;
    }
  }, [content]);





  const [newRole, setNewRole] = useState<string>("");
  const [customRole, setCustomRole] = useState<string>("");
  const [newRoleName, setNewRoleName] = useState<string>("");

  const derivedRole = useMemo(() => {
    const v = (newRole === "__custom__" ? customRole : newRole).trim();
    return v || "";
  }, [newRole, customRole]);

  const [skillsList, setSkillsList] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string>("");
  const [installingSkill, setInstallingSkill] = useState(false);
  const [teamSkillMsg, setTeamSkillMsg] = useState<string>("");
  const [teamSkillError, setTeamSkillError] = useState<string>("");

  const teamRecipes = useMemo(() => recipes.filter((r) => r.kind === "team"), [recipes]);

  const toRecipe = useMemo(() => {
    const ws = recipes.find((r) => r.id === toId && r.source === "workspace");
    return ws ?? recipes.find((r) => r.id === toId) ?? null;
  }, [recipes, toId]);

  const teamIdValid = Boolean(teamId.trim());
  const targetIdValid = Boolean(toId.trim());
  const hasWorkspaceOverride = recipes.some((r) => r.id === toId && r.source === "workspace");
  const targetIsBuiltin = Boolean(toRecipe?.source === "builtin" && !hasWorkspaceOverride);
  const canEditTargetId = true;

  useEffect(() => {
    setToId(teamId);
    setToName(teamId);
    setContent("");
    setLoadedRecipeHash(null);
    setTeamMetaRecipeHash(null);
    setPublishOpen(false);
    setDeleteOpen(false);
    const valid: TabId[] = ["recipe", "agents", "skills", "cron", "files", "memory", "orchestrator", "workflows"];
    if (initialTab && valid.includes(initialTab as TabId)) {
      setActiveTab(initialTab as TabId);
    }
  }, [teamId, initialTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadTeamEditorInitial(teamId, {
      setRecipes,
      setLockedFromId,
      setLockedFromName,
      setProvenanceMissing,
      setFromId,
      setTeamMetaRecipeHash,
      setTeamFiles,
      setCronJobs,
      setTeamAgents,
      setSkillsList,
      setAvailableSkills,
      setSelectedSkill,
      setTeamFilesLoading,
      setCronLoading,
      setTeamAgentsLoading,
      setSkillsLoading,
    })
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((e: unknown) => {
        flashMessage(errorMessage(e), "error");
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Initial load only; flashMessage and setters are stable.
  }, [teamId]);

  async function onLoadTeamRecipeMarkdown() {
    const id = toId.trim();
    if (!id) return;
    setLoadingSource(true);
    setRecipeLoadError("");
    try {
      const json = await fetchJson<{ recipe?: RecipeDetail; recipeHash?: string }>(`/api/recipes/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const r = json.recipe as RecipeDetail;
      setContent(r.content);
      setLoadedRecipeHash(typeof json.recipeHash === "string" ? json.recipeHash : null);
    } catch (e: unknown) {
      setRecipeLoadError(errorMessage(e));
    } finally {
      setLoadingSource(false);
    }
  }

  useEffect(() => {
    const id = toId.trim();
    if (!id) return;
    if (content.trim()) return;
    if (loadingSource) return;
    void onLoadTeamRecipeMarkdown();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Sync toId to load; onLoadTeamRecipeMarkdown and content are intentionally omitted.
  }, [toId]);

  async function ensureCustomRecipeExists(args: { overwrite: boolean; toId?: string; toName?: string; scaffold?: boolean }) {
    const f = fromId.trim();
    const id = String(args.toId ?? toId).trim();
    const name = String(args.toName ?? toName).trim();
    const overwrite = Boolean(args.overwrite);
    const scaffold = Boolean(args.scaffold);
    if (!f) throw new Error("Source recipe id is required");
    if (!id) throw new Error("Custom recipe id is required");
    const json = await fetchJson<{ filePath: string; content: string; scaffold?: { ok: boolean; error?: string } | null }>(
      "/api/recipes/clone",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromId: f, toId: id, toName: name || undefined, overwrite, scaffold }),
      }
    );
    return json;
  }

  async function onSaveCustom(overwrite: boolean, overrides?: { toId?: string; toName?: string; scaffold?: boolean }) {
    setSaving(true);
    flashMessage("");
    try {
      const json = await ensureCustomRecipeExists({ overwrite, ...overrides });
      if (json.scaffold && !json.scaffold.ok) {
        flashMessage(`Scaffold failed (recipe was still cloned): ${json.scaffold.error || "Unknown error"}`, "error");
      }
      const hasEdits = Boolean(content.trim()) && content.trim() !== json.content.trim();
      if (hasEdits) {
        const nextContent = forceFrontmatterTeamTeamId(forceFrontmatterId(content, toId.trim()), toId.trim());
        await fetchJson(`/api/recipes/${encodeURIComponent(toId.trim())}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: nextContent }),
        });
        setContent(nextContent);
      } else {
        setContent(json.content);
      }
      try {
        const next = await fetchJson<{ recipeHash?: string }>(`/api/recipes/${encodeURIComponent(toId.trim())}`, {
          cache: "no-store",
        });
        if (typeof next.recipeHash === "string") setLoadedRecipeHash(next.recipeHash);
      } catch {
        setLoadedRecipeHash(null);
      }
      flashMessage(`Saved team recipe: ${json.filePath}`, "success");
    } catch (e: unknown) {
      flashMessage(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onLoadTeamFile(name: string) {
    setSaving(true);
    setTeamFileError("");
    try {
      const json = await fetchJson<{ ok?: boolean; content?: string }>(
        `/api/teams/file?teamId=${encodeURIComponent(teamId)}&name=${encodeURIComponent(name)}`,
        { cache: "no-store" }
      );
      if (!json.ok) throw new Error("Failed to load file");
      setFileName(name);
      setFileContent(String(json.content ?? ""));
    } catch (e: unknown) {
      setTeamFileError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTeamFile() {
    setSaving(true);
    setTeamFileError("");
    try {
      const json = await fetchJson<{ ok?: boolean }>("/api/teams/file", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, name: fileName, content: fileContent }),
      });
      if (!json.ok) throw new Error("Failed to save file");
    } catch (e: unknown) {
      setTeamFileError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onAddAgent() {
    setSaving(true);
    try {
      await handleAddAgentToTeam({
        teamId,
        toId,
        newRole,
        derivedRole,
        newRoleName,
        content,
        setContent,
        setTeamAgents,
        flashMessage,
        ensureCustomRecipeExists,
      });
    } catch (e: unknown) {
      flashMessage(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onCronAction(id: string, label: string, action: "enable" | "disable" | "run") {
    setSaving(true);
    try {
      await fetchJson("/api/cron/job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      flashMessage(`Cron ${action}: ${label}`, "success");
    } catch (e: unknown) {
      flashMessage(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onInstallSkill() {
    setInstallingSkill(true);
    setTeamSkillMsg("");
    setTeamSkillError("");
    try {
      await fetchJson("/api/teams/skills/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, skill: selectedSkill }),
      });
      setTeamSkillMsg(`Installed skill: ${selectedSkill}`);
      try {
        const j = await fetchJson<{ ok?: boolean; skills?: string[] }>(
          `/api/teams/skills?teamId=${encodeURIComponent(teamId)}`,
          { cache: "no-store" }
        );
        if (j.ok && Array.isArray(j.skills)) setSkillsList(j.skills);
      } catch {
        // ignore
      }
    } catch (e: unknown) {
      setTeamSkillError(errorMessage(e));
    } finally {
      setInstallingSkill(false);
    }
  }

  return (
    <div className="ck-glass w-full p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Team editor</h1>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Bootstrap a <strong>custom team recipe</strong> for this installed team, without modifying builtin recipes.
      </p>


      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as TabId)}
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

      {activeTab === "recipe" && (
        <TeamRecipeTab
          loading={loading}
          fromId={fromId}
          setFromId={setFromId}
          toId={toId}
          setToId={setToId}
          toName={toName}
          setToName={setToName}
          canEditTargetId={canEditTargetId}
          teamRecipes={teamRecipes}
          lockedFromId={lockedFromId}
          lockedFromName={lockedFromName}
          provenanceMissing={provenanceMissing}
          saving={saving}
          teamIdValid={teamIdValid}
          targetIdValid={targetIdValid}
          targetIsBuiltin={targetIsBuiltin}
          loadedRecipeHash={loadedRecipeHash}
          teamMetaRecipeHash={teamMetaRecipeHash}
          publishing={publishing}
          content={content}
          setContent={setContent}
          setLoadedRecipeHash={setLoadedRecipeHash}
          recipeLoadError={recipeLoadError}
          onSaveCustom={onSaveCustom}
          onPublishOpen={() => setPublishOpen(true)}
          onDeleteOpen={() => setDeleteOpen(true)}
        />
      )}

      {activeTab === "agents" && (
        <TeamAgentsTab
          teamId={teamId}
          toId={toId}
          recipeAgents={recipeAgents}
          newRole={newRole}
          setNewRole={setNewRole}
          customRole={customRole}
          setCustomRole={setCustomRole}
          newRoleName={newRoleName}
          setNewRoleName={setNewRoleName}
          derivedRole={derivedRole}
          saving={saving}
          teamAgents={teamAgents}
          teamAgentsLoading={teamAgentsLoading}
          onAddAgent={onAddAgent}
        />
      )}

      {activeTab === "skills" && (
        <TeamSkillsTab
          teamId={teamId}
          skillsList={skillsList}
          availableSkills={availableSkills}
          skillsLoading={skillsLoading}
          selectedSkill={selectedSkill}
          setSelectedSkill={setSelectedSkill}
          installingSkill={installingSkill}
          teamSkillMsg={teamSkillMsg}
          teamSkillError={teamSkillError}
          onInstallSkill={onInstallSkill}
        />
      )}

      {activeTab === "cron" && (
        <TeamCronTab
          cronJobs={cronJobs}
          cronLoading={cronLoading}
          saving={saving}
          onCronAction={onCronAction}
        />
      )}


      {activeTab === "orchestrator" && <OrchestratorPanel teamId={teamId} />}

      {activeTab === "memory" && (
        <div className="mt-6">
          <TeamMemoryTab teamId={teamId} />
        </div>
      )}

      {activeTab === "workflows" && (
        <div className="mt-6">
          <WorkflowsClient teamId={teamId} />
        </div>
      )}

      {activeTab === "deliverables" && (
        <div className="mt-6">
          <DeliverablesTab teamId={teamId} />
        </div>
      )}


      {activeTab === "files" && (
        <TeamFilesTab
          teamFiles={teamFiles}
          teamFilesLoading={teamFilesLoading}
          showOptionalFiles={showOptionalFiles}
          setShowOptionalFiles={setShowOptionalFiles}
          fileName={fileName}
          fileContent={fileContent}
          setFileContent={setFileContent}
          teamFileError={teamFileError}
          saving={saving}
          onLoadTeamFile={onLoadTeamFile}
          onSaveTeamFile={onSaveTeamFile}
        />
      )}

      {/* Plugins tab disabled - not ready for production
      {activeTab === "plugins" && (
        <div className="mt-6">
          <PluginTabs teamType={teamType} teamId={teamId} />
        </div>
      )}
      */}

      <PublishChangesModal
        open={publishOpen}
        teamId={teamId}
        recipeId={toId}
        busy={publishing}
        onClose={() => setPublishOpen(false)}
        onConfirm={async () => {
          setPublishing(true);
          try {
            await fetchJson("/api/scaffold", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                kind: "team",
                recipeId: toId.trim(),
                teamId,
                overwrite: true,
                applyConfig: true,
              }),
            });
            try {
              const metaJson = await fetchJson<{ ok?: boolean; meta?: { recipeHash?: string } }>(
                `/api/teams/meta?teamId=${encodeURIComponent(teamId)}`,
                { cache: "no-store" }
              );
              if (metaJson.ok && metaJson.meta && typeof metaJson.meta.recipeHash === "string") {
                setTeamMetaRecipeHash(metaJson.meta.recipeHash);
              }
            } catch {
              // ignore
            }
            setPublishOpen(false);
            flashMessage("Published changes to active team", "success");
          } catch (e: unknown) {
            flashMessage(errorMessage(e), "error");
          } finally {
            setPublishing(false);
          }
        }}
      />

      <DeleteTeamModal
        open={deleteOpen}
        teamId={teamId}
        busy={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await fetchJson("/api/teams/remove-team", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ teamId }),
            });
            flashMessage("Deleted team successfully", "success");
            setDeleteOpen(false);
            setTimeout(() => router.push("/"), 250);
          } catch (e: unknown) {
            flashMessage(errorMessage(e), "error");
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}
