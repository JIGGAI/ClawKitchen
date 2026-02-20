"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DeleteTeamModal } from "./DeleteTeamModal";
import { PublishChangesModal } from "./PublishChangesModal";
import { useToast } from "@/components/ToastProvider";

type RecipeListItem = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

type RecipeDetail = RecipeListItem & {
  content: string;
  filePath: string | null;
};


function forceFrontmatterId(md: string, id: string) {
  if (!md.startsWith("---\n")) return md;
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return md;
  const fm = md.slice(4, end);
  const body = md.slice(end + 5);

  const lines = fm.split("\n");
  let found = false;
  const nextLines = lines.map((line) => {
    if (/^id\s*:/i.test(line)) {
      found = true;
      return `id: ${id}`;
    }
    return line;
  });
  if (!found) nextLines.unshift(`id: ${id}`);

  return `---\n${nextLines.join("\n")}\n---\n${body}`;
}

function forceFrontmatterTeamTeamId(md: string, teamId: string) {
  // Best-effort YAML frontmatter patch without reparsing the whole recipe.
  // Goal: ensure `team: { teamId: <id> }` matches the custom recipe id after Save.
  if (!md.startsWith("---\n")) return md;
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return md;

  const fm = md.slice(4, end);
  const body = md.slice(end + 5);
  const lines = fm.split("\n");

  const next: string[] = [];
  let inTeam = false;
  let sawTeamBlock = false;
  let patched = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^team\s*:\s*$/i.test(line)) {
      inTeam = true;
      sawTeamBlock = true;
      next.push(line);
      continue;
    }

    // Leave team block when indentation returns to column 0.
    if (inTeam && /^\S/.test(line)) {
      inTeam = false;
    }

    if (inTeam && /^\s+teamId\s*:/i.test(line)) {
      next.push(`  teamId: ${teamId}`);
      patched = true;
      continue;
    }

    next.push(line);
  }

  // If there was a team block but no teamId, insert it right after `team:`.
  if (sawTeamBlock && !patched) {
    const out: string[] = [];
    for (let i = 0; i < next.length; i++) {
      out.push(next[i]);
      if (/^team\s*:\s*$/i.test(next[i])) {
        out.push(`  teamId: ${teamId}`);
        patched = true;
      }
    }
    return `---\n${out.join("\n")}\n---\n${body}`;
  }

  return `---\n${next.join("\n")}\n---\n${body}`;
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
  const [loadedRecipeHash, setLoadedRecipeHash] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"recipe" | "agents" | "skills" | "cron" | "files">("recipe");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
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

  const [teamFiles, setTeamFiles] = useState<Array<{ name: string; missing: boolean; required: boolean; rationale?: string }>>([]);
  const [teamFilesLoading, setTeamFilesLoading] = useState(false);
  const [teamFileError, setTeamFileError] = useState<string>("");
  const [showOptionalFiles, setShowOptionalFiles] = useState(false);
  const [fileName, setFileName] = useState<string>("SOUL.md");
  const [fileContent, setFileContent] = useState<string>("");

  const [cronJobs, setCronJobs] = useState<unknown[]>([]);
  const [cronLoading, setCronLoading] = useState(false);

  const [teamAgents, setTeamAgents] = useState<Array<{ id: string; identityName?: string }>>([]);
  const [teamAgentsLoading, setTeamAgentsLoading] = useState(false);

  const [newRole, setNewRole] = useState<string>("");
  const [customRole, setCustomRole] = useState<string>("");
  const [newRoleName, setNewRoleName] = useState<string>("");

  const derivedRole = useMemo(() => {
    const v = (newRole === "__custom__" ? customRole : newRole).trim();
    if (!v) return "";
    if (v.startsWith(`${teamId}-`)) return v.slice(teamId.length + 1);
    return v;
  }, [newRole, customRole, teamId]);

  const [skillsList, setSkillsList] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string>("");
  const [installingSkill, setInstallingSkill] = useState(false);
  const [teamSkillMsg, setTeamSkillMsg] = useState<string>("");
  const [teamSkillError, setTeamSkillError] = useState<string>("");

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
    setContent("");
    setLoadedRecipeHash(null);
    setTeamMetaRecipeHash(null);
    setPublishOpen(false);
    setDeleteOpen(false);
  }, [teamId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [recipesRes, metaRes] = await Promise.all([
          fetch("/api/recipes", { cache: "no-store" }),
          fetch(`/api/teams/meta?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
        ]);

        const json = await recipesRes.json();
        const list = (json.recipes ?? []) as RecipeListItem[];
        setRecipes(list);

        // Note: do not sync toName/toId from remote state here.
        // Edits to the target id/name must not trigger reload loops while typing.

        // Prefer a recipe that corresponds to this teamId.
        // Primary source of truth: provenance stored in the team workspace.
        // Fallback: heuristic matching (legacy teams without provenance).
        let locked: { recipeId: string; recipeName?: string } | null = null;
        try {
          const metaJson = await metaRes.json();
          if (metaRes.ok && metaJson.ok && metaJson.meta && (metaJson.meta as { recipeId?: unknown }).recipeId) {
            const m = metaJson.meta as { recipeId?: unknown; recipeName?: unknown; recipeHash?: unknown };
            locked = {
              recipeId: String(m.recipeId),
              recipeName: typeof m.recipeName === "string" ? m.recipeName : undefined,
            };
            const h = typeof m.recipeHash === "string" ? m.recipeHash : null;
            setTeamMetaRecipeHash(h);
          } else {
            setTeamMetaRecipeHash(null);
          }
        } catch {
          // ignore
        }

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

        // Render ASAP; load the heavier per-tab data in the background.
        setLoading(false);

        void (async () => {
          setTeamFilesLoading(true);
          setCronLoading(true);
          setTeamAgentsLoading(true);
          setSkillsLoading(true);

          try {
            const [filesRes, cronRes, agentsRes, skillsRes, availableSkillsRes] = await Promise.all([
              fetch(`/api/teams/files?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
              fetch(`/api/cron/jobs?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
              fetch("/api/agents", { cache: "no-store" }),
              fetch(`/api/teams/skills?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
              fetch("/api/skills/available", { cache: "no-store" }),
            ]);

            try {
              const filesJson = (await filesRes.json()) as { ok?: boolean; files?: unknown[] };
              if (filesRes.ok && filesJson.ok) {
                const files = Array.isArray(filesJson.files) ? filesJson.files : [];
                setTeamFiles(
                  files.map((f) => {
                    const entry = f as { name?: unknown; missing?: unknown; required?: unknown; rationale?: unknown };
                    return {
                      name: String(entry.name ?? ""),
                      missing: Boolean(entry.missing),
                      required: Boolean(entry.required),
                      rationale: typeof entry.rationale === "string" ? entry.rationale : undefined,
                    };
                  }),
                );
              }
            } catch {
              // ignore
            }

            try {
              const cronJson = (await cronRes.json()) as { ok?: boolean; jobs?: unknown[] };
              if (cronRes.ok && cronJson.ok) {
                const all = Array.isArray(cronJson.jobs) ? cronJson.jobs : [];
                setCronJobs(all);
              }
            } catch {
              // ignore
            }

            try {
              const agentsJson = (await agentsRes.json()) as { agents?: unknown[] };
              if (agentsRes.ok) {
                const all = Array.isArray(agentsJson.agents) ? agentsJson.agents : [];
                // Team membership for agents is by id convention: <teamId>-<role>
                const filtered = all.filter((a) => String((a as { id?: unknown }).id ?? "").startsWith(`${teamId}-`));
                setTeamAgents(
                  filtered.map((a) => {
                    const agent = a as { id?: unknown; identityName?: unknown };
                    return { id: String(agent.id ?? ""), identityName: typeof agent.identityName === "string" ? agent.identityName : undefined };
                  }),
                );
              }
            } catch {
              // ignore
            }

            try {
              const skillsJson = await skillsRes.json();
              if (skillsRes.ok && skillsJson.ok) {
                setSkillsList(Array.isArray(skillsJson.skills) ? (skillsJson.skills as string[]) : []);
              }
            } catch {
              // ignore
            }

            try {
              const availableSkillsJson = (await availableSkillsRes.json()) as { ok?: boolean; skills?: unknown[] };
              if (availableSkillsRes.ok && availableSkillsJson.ok) {
                const list = Array.isArray(availableSkillsJson.skills) ? (availableSkillsJson.skills as string[]) : [];
                setAvailableSkills(list);
                setSelectedSkill((prev) => {
                  const p = String(prev ?? "").trim();
                  if (p && list.includes(p)) return p;
                  return list[0] ?? "";
                });
              }
            } catch {
              // ignore
            }
          } finally {
            setTeamFilesLoading(false);
            setCronLoading(false);
            setTeamAgentsLoading(false);
            setSkillsLoading(false);
          }
        })();
      } catch (e: unknown) {
        flashMessage(e instanceof Error ? e.message : String(e), "error");
      } finally {
        // If the happy-path already flipped loading=false early, this is a no-op.
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function onLoadTeamRecipeMarkdown() {
    const id = toId.trim();
    if (!id) return;
    setLoadingSource(true);
    setRecipeLoadError("");
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        // Usually means the workspace recipe doesn't exist yet.
        throw new Error(json.error || `Recipe not found: ${id}. Save first to create it.`);
      }
      const r = json.recipe as RecipeDetail;
      setContent(r.content);
      setLoadedRecipeHash(typeof json.recipeHash === "string" ? json.recipeHash : null);
    } catch (e: unknown) {
      setRecipeLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSource(false);
    }
  }

  // Load raw recipe markdown by default (no "click to load").
  useEffect(() => {
    const id = toId.trim();
    if (!id) return;
    if (content.trim()) return;
    if (loadingSource) return;
    void onLoadTeamRecipeMarkdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toId]);

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
        const nextContent = forceFrontmatterTeamTeamId(forceFrontmatterId(content, toId.trim()), toId.trim());
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

      // Refresh hash from server so Publish can reliably detect unpropagated changes.
      try {
        const res = await fetch(`/api/recipes/${encodeURIComponent(toId.trim())}`, { cache: "no-store" });
        const next = await res.json();
        if (res.ok && typeof next.recipeHash === "string") setLoadedRecipeHash(next.recipeHash);
      } catch {
        setLoadedRecipeHash(null);
      }

      flashMessage(`Saved team recipe: ${json.filePath}`, "success");
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      flashMessage(raw, "error");
    } finally {
      setSaving(false);
    }
  }

  async function onLoadTeamFile(name: string) {
    setSaving(true);
    setTeamFileError("");
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
      setTeamFileError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTeamFile() {
    setSaving(true);
    setTeamFileError("");
    try {
      const res = await fetch("/api/teams/file", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, name: fileName, content: fileContent }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save file");
      // No toast; keep file-related messaging local.
    } catch (e: unknown) {
      setTeamFileError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Initial load only gates the minimal state (recipes + team meta). Everything else streams in.
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

      {activeTab === "recipe" ? (
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
              {/* Load team markdown removed (auto-loads by default). */}

              <button
                type="button"
                disabled={saving || !teamIdValid || !targetIdValid || targetIsBuiltin}
                onClick={() => onSaveCustom(true)}
                className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                disabled={
                  saving ||
                  !teamIdValid ||
                  !targetIdValid ||
                  targetIsBuiltin ||
                  // Enabled only when there are unpropagated (saved) changes.
                  !loadedRecipeHash ||
                  !teamMetaRecipeHash ||
                  loadedRecipeHash === teamMetaRecipeHash
                }
                onClick={() => setPublishOpen(true)}
                className="rounded-[var(--ck-radius-sm)] bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50"
              >
                {publishing ? "Publishing…" : "Publish changes"}
              </button>

              <button
                type="button"
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
              {lockedFromId ? (
                <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                  <code>{lockedFromId}</code>
                  {lockedFromName ? ` (${lockedFromName})` : ""}
                </div>
              ) : provenanceMissing ? (
                <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                  Provenance not found for this team. The parent recipe above is a best-guess.
                </div>
              ) : null}


            </div>

            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
              <li>
                <strong>Save</strong> writes/overwrites the custom recipe file identified by “Team id”.
              </li>
              <li>
                <strong>Publish changes</strong> re-scaffolds this team from your current custom recipe and applies config (complete overwrite).
              </li>
              <li>
                <strong>Delete Team</strong> runs the safe uninstall command (<code>openclaw recipes remove-team</code>).
              </li>
            </ul>
          </div>
        </div>
      ) : null}

      {activeTab === "agents" ? (
        <div className="mt-6 ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Agents in this team</div>
          <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
            Add/remove agents by updating the <code>agents:</code> list in your custom team recipe (<code>{toId}</code>).
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Role</label>
              <input
                value={customRole}
                onChange={(e) => {
                  setNewRole("__custom__");
                  setCustomRole(e.target.value);
                }}
                placeholder="e.g. researcher"
                className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
              />
              <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
                This writes to the recipe’s <code>agents:</code> list. Agent id will be <code>{teamId}-&lt;role&gt;</code> (ex: <code>{teamId}-researcher</code>).
              </div>
            </div>

            <div className="sm:col-span-2">
              <div>
                <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Name (optional)</label>
                <input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Onchain Researcher"
                  className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={saving || !derivedRole}
              onClick={async () => {
                setSaving(true);
                try {
                  try {
                    await ensureCustomRecipeExists({ overwrite: false });
                  } catch (e: unknown) {
                    // If the custom recipe already exists, proceed; we only needed to ensure a workspace file exists.
                    // Note: /api/recipes/clone returns 409 in this case.
                    const msg = e instanceof Error ? e.message : String(e);
                    if (!/Recipe id already exists:/i.test(msg)) throw e;
                  }
                  const res = await fetch("/api/recipes/team-agents", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      recipeId: toId.trim(),
                      op: "add",
                      role: derivedRole,
                      name: newRoleName,
                    }),
                  });
                  const json = await res.json();
                  if (!res.ok || !json.ok) throw new Error(json.error || "Failed updating agents list");
                  setContent(String(json.content ?? content));
                  flashMessage(`Updated agents list in ${toId}`, "success");
                } catch (e: unknown) {
                  flashMessage(e instanceof Error ? e.message : String(e), "error");
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
            >
              Add agent
            </button>
            {/* remove-agent UI intentionally omitted */}
          </div>

          <div className="mt-6">
            <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Installed team agents</div>

            <div className="mt-2 max-w-md">
              <label className="block text-xs font-medium text-[color:var(--ck-text-secondary)]">Open agent</label>
              <select
                value={""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  router.push(`/agents/${encodeURIComponent(v)}?returnTo=${encodeURIComponent(`/teams/${teamId}?tab=agents`)}`);
                }}
                className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                disabled={teamAgentsLoading || !teamAgents.length}
              >
                <option value="">Select an agent…</option>
                {teamAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.identityName || a.id}
                  </option>
                ))}
              </select>
            </div>

            <ul className="mt-4 space-y-2">
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
                      href={`/agents/${encodeURIComponent(a.id)}?returnTo=${encodeURIComponent(`/teams/${teamId}?tab=agents`)}`}
                    >
                      Edit
                    </a>
                  </li>
                ))
              ) : teamAgentsLoading ? (
                <li className="text-sm text-[color:var(--ck-text-secondary)]">Loading…</li>
              ) : (
                <li className="text-sm text-[color:var(--ck-text-secondary)]">No team agents detected.</li>
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {activeTab === "skills" ? (
        <div className="mt-6 ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Skills</div>
          <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
            Skills installed in this <strong>team</strong> workspace (<code>skills/</code>). These are available to all agents in the team.
            For agent-specific skills, open the agent from the Agents tab.
          </p>

          <div className="mt-4">
            <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Installed</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
              {skillsList.length ? skillsList.map((s) => <li key={s}>{s}</li>) : <li>None installed.</li>}
            </ul>
          </div>

          <div className="mt-5 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15 p-3">
            <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Add a skill</div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                className="w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                disabled={installingSkill || skillsLoading || !availableSkills.length}
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
                disabled={installingSkill || skillsLoading || !selectedSkill}
                onClick={async () => {
                  setInstallingSkill(true);
                  setTeamSkillMsg("");
                  setTeamSkillError("");
                  try {
                    const res = await fetch("/api/teams/skills/install", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ teamId, skill: selectedSkill }),
                    });
                    const json = await res.json();
                    if (!res.ok || !json.ok) throw new Error(json.error || "Failed to install skill");
                    setTeamSkillMsg(`Installed skill: ${selectedSkill}`);

                    // Refresh installed list.
                    const r = await fetch(`/api/teams/skills?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" });
                    const j = await r.json();
                    if (r.ok && j.ok) setSkillsList(Array.isArray(j.skills) ? (j.skills as string[]) : []);
                  } catch (e: unknown) {
                    setTeamSkillError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setInstallingSkill(false);
                  }
                }}
                className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
              >
                {installingSkill ? "Adding…" : "Add"}
              </button>
            </div>
            {teamSkillError ? (
              <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                {teamSkillError}
              </div>
            ) : null}

            {teamSkillMsg ? (
              <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                {teamSkillMsg}
              </div>
            ) : null}

            <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
              This uses <code>openclaw recipes install-skill &lt;skill&gt; --team-id {teamId} --yes</code>.
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "cron" ? (
        <div className="mt-6 ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Cron jobs (filtered by team name)</div>
          <ul className="mt-3 space-y-3">
            {cronJobs.length ? (
              cronJobs.map((j) => {
                const job = j as {
                  id?: unknown;
                  jobId?: unknown;
                  name?: unknown;
                  enabled?: unknown;
                  state?: { enabled?: unknown };
                };
                const id = String(job.id ?? job.jobId ?? "").trim();
                const key = id || String(job.name ?? "job");
                const label = String(job.name ?? job.id ?? job.jobId ?? "(unnamed)");
                const enabled = job.enabled ?? job.state?.enabled;

                async function act(action: "enable" | "disable" | "run") {
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
                    flashMessage(e instanceof Error ? e.message : String(e), "error");
                  } finally {
                    setSaving(false);
                  }
                }

                return (
                  <li key={key} className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
                    <div className="font-medium text-[color:var(--ck-text-primary)]">{label}</div>
                    <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">Enabled: {String(enabled ?? "?")}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        disabled={saving || !id}
                        onClick={() => act("run")}
                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
                      >
                        Run
                      </button>
                      <button
                        disabled={saving || !id}
                        onClick={() => act("enable")}
                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
                      >
                        Enable
                      </button>
                      <button
                        disabled={saving || !id}
                        onClick={() => act("disable")}
                        className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-50"
                      >
                        Disable
                      </button>
                      {!id ? (
                        <div className="text-xs text-[color:var(--ck-text-tertiary)]">(missing id)</div>
                      ) : null}
                    </div>
                  </li>
                );
              })
            ) : cronLoading ? (
              <li className="text-sm text-[color:var(--ck-text-secondary)]">Loading…</li>
            ) : (
              <li className="text-sm text-[color:var(--ck-text-secondary)]">No cron jobs detected for this team.</li>
            )}
          </ul>
        </div>
      ) : null}

      {activeTab === "files" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="ck-glass-strong p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Team files</div>
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
              {teamFilesLoading ? (
                <li className="text-sm text-[color:var(--ck-text-secondary)]">Loading…</li>
              ) : null}
              {teamFiles
                .filter((f) => (showOptionalFiles ? true : f.required || !f.missing))
                .map((f) => (
                <li key={f.name}>
                  <button
                    onClick={() => onLoadTeamFile(f.name)}
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
              <button
                disabled={saving}
                onClick={onSaveTeamFile}
                className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save file"}
              </button>
            </div>

            {teamFileError ? (
              <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                {teamFileError}
              </div>
            ) : null}

            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="mt-3 h-[55vh] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
              spellCheck={false}
            />
          </div>
        </div>
      ) : null}

      {/* markdown editor lives below for convenience */}
      {activeTab === "recipe" ? (
        <div className="mt-6 ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe markdown</div>

          {recipeLoadError ? (
            <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
              {recipeLoadError}
            </div>
          ) : null}

          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setLoadedRecipeHash(null);
            }}
            className="mt-2 h-[55vh] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
            spellCheck={false}
          />
        </div>
      ) : null}

      {/* Clone Team removed (per #0075). */}

      <PublishChangesModal
        open={publishOpen}
        teamId={teamId}
        recipeId={toId}
        busy={publishing}
        onClose={() => setPublishOpen(false)}
        onConfirm={async () => {
          setPublishing(true);
          try {
            const res = await fetch("/api/scaffold", {
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
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || "Publish failed");

            // Refresh team meta so we can reflect published hash/state.
            try {
              const metaRes = await fetch(`/api/teams/meta?teamId=${encodeURIComponent(teamId)}`, {
                cache: "no-store",
              });
              const metaJson = await metaRes.json();
              if (metaRes.ok && metaJson.ok && metaJson.meta && typeof metaJson.meta.recipeHash === "string") {
                setTeamMetaRecipeHash(metaJson.meta.recipeHash);
              }
            } catch {
              // ignore
            }

            setPublishOpen(false);
            flashMessage("Published changes to active team", "success");
          } catch (e: unknown) {
            flashMessage(e instanceof Error ? e.message : String(e), "error");
          } finally {
            setPublishing(false);
          }
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
            flashMessage(e instanceof Error ? e.message : String(e), "error");
          } finally {
            setSaving(false);
          }
        }}
      />

      {/* duplicate markdown editor removed */}
    </div>
  );
}
