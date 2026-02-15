"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CloneTeamModal } from "./CloneTeamModal";
import { DeleteTeamModal } from "./DeleteTeamModal";
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

  function flashMessage(next: string, kind: "success" | "error" | "info" = "info") {
    const msg = String(next ?? "").trim();
    if (!msg) return;
    toast.push({ kind, message: msg });
  }

  const [teamFiles, setTeamFiles] = useState<Array<{ name: string; missing: boolean; required: boolean; rationale?: string }>>([]);
  const [showOptionalFiles, setShowOptionalFiles] = useState(false);
  const [fileName, setFileName] = useState<string>("SOUL.md");
  const [fileContent, setFileContent] = useState<string>("");
  const [cronJobs, setCronJobs] = useState<unknown[]>([]);
  const [teamAgents, setTeamAgents] = useState<Array<{ id: string; identityName?: string }>>([]);
  const [newRole, setNewRole] = useState<string>("");
  const [newRoleName, setNewRoleName] = useState<string>("");
  const [skillsList, setSkillsList] = useState<string[]>([]);

  const teamRecipes = useMemo(() => recipes.filter((r) => r.kind === "team"), [recipes]);

  const toRecipe = useMemo(() => recipes.find((r) => r.id === toId) ?? null, [recipes, toId]);

  const teamIdValid = Boolean(teamId.trim());
  const targetIdValid = Boolean(toId.trim());
  const targetIsBuiltin = toRecipe?.source === "builtin";
  // The "Recipe id" field is the workspace recipe id target.
  // It should be editable, and we must not auto-prefix/modify what the user types.
  const canEditTargetId = true;

  // Initialize defaults whenever we navigate to a new team.
  useEffect(() => {
    setToId(teamId);
    setToName(teamId);
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
            const m = metaJson.meta as { recipeId?: unknown; recipeName?: unknown };
            locked = {
              recipeId: String(m.recipeId),
              recipeName: typeof m.recipeName === "string" ? m.recipeName : undefined,
            };
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

        // Load ancillary data for sub-areas.
        const [filesRes, cronRes, agentsRes, skillsRes] = await Promise.all([
          fetch(`/api/teams/files?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
          fetch("/api/cron/jobs", { cache: "no-store" }),
          fetch("/api/agents", { cache: "no-store" }),
          fetch(`/api/teams/skills?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
        ]);

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

        const cronJson = (await cronRes.json()) as { ok?: boolean; jobs?: unknown[] };
        if (cronRes.ok && cronJson.ok) {
          const all = Array.isArray(cronJson.jobs) ? cronJson.jobs : [];
          const filtered = all.filter((j) => String((j as { name?: unknown }).name ?? "").includes(teamId));
          setCronJobs(filtered);
        }

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

        const skillsJson = await skillsRes.json();
        if (skillsRes.ok && skillsJson.ok) {
          setSkillsList(Array.isArray(skillsJson.skills) ? skillsJson.skills : []);
        }
      } catch (e: unknown) {
        flashMessage(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

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
      flashMessage(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoadingSource(false);
    }
  }

  async function ensureCustomRecipeExists(overwrite: boolean) {
    const f = fromId.trim();
    const id = toId.trim();
    if (!f) throw new Error("Source recipe id is required");
    if (!id) throw new Error("Custom recipe id is required");

    const res = await fetch("/api/recipes/clone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromId: f, toId: id, toName: toName.trim() || undefined, overwrite }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    return json as { filePath: string; content: string };
  }

  async function onSaveCustom(overwrite: boolean) {
    setSaving(true);
    flashMessage("");
    try {
      const json = await ensureCustomRecipeExists(overwrite);

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
      const raw = e instanceof Error ? e.message : String(e);
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
      flashMessage(e instanceof Error ? e.message : String(e), "error");
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
      flashMessage(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="ck-glass mx-auto max-w-4xl p-6">Loading…</div>;

  return (
    <div className="ck-glass mx-auto max-w-6xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Team editor</h1>
      <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
        Phase v2 (thin slice): bootstrap a <strong>custom team recipe</strong> for this installed team, without
        modifying builtin recipes.
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
                <strong>Clone Team</strong> creates a new custom recipe copy (fails if it already exists).
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
              onClick={async () => {
                setSaving(true);
                                try {
                  await ensureCustomRecipeExists(false);
                  const res = await fetch("/api/recipes/team-agents", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ recipeId: toId.trim(), op: "add", role: newRole, name: newRoleName }),
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
              Add / Update role
            </button>
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                                try {
                  await ensureCustomRecipeExists(false);
                  const res = await fetch("/api/recipes/team-agents", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ recipeId: toId.trim(), op: "remove", role: newRole }),
                  });
                  const json = await res.json();
                  if (!res.ok || !json.ok) throw new Error(json.error || "Failed updating agents list");
                  setContent(String(json.content ?? content));
                  flashMessage(`Removed role ${newRole} from ${toId}`, "success");
                } catch (e: unknown) {
                  flashMessage(e instanceof Error ? e.message : String(e), "error");
                } finally {
                  setSaving(false);
                }
              }}
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
      ) : null}

      {activeTab === "skills" ? (
        <div className="mt-6 ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Installed skills (team workspace)</div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
            {skillsList.length ? skillsList.map((s) => <li key={s}>{s}</li>) : <li>None detected (or skills dir missing).</li>}
          </ul>
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
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-2 h-[55vh] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 font-mono text-xs text-[color:var(--ck-text-primary)]"
            spellCheck={false}
          />
        </div>
      ) : null}

      <CloneTeamModal
        key={cloneNonce}
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        recipes={recipes}
        onConfirm={async ({ id, name }) => {
          setCloneOpen(false);
          // Set the target fields, then execute the clone (create-only) save.
          setToId(id);
          setToName(name);
          // Ensure we run after state updates apply.
          setTimeout(() => onSaveCustom(false), 0);
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
