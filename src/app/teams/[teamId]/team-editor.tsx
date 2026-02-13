"use client";

import { useEffect, useMemo, useState } from "react";

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

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TeamEditor({ teamId }: { teamId: string }) {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>(`custom-${teamId}`);
  const [toName, setToName] = useState<string>(`Custom ${teamId}`);
  const [content, setContent] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"recipe" | "agents" | "skills" | "cron" | "files">("recipe");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  const [teamFiles, setTeamFiles] = useState<Array<{ name: string; missing: boolean }>>([]);
  const [fileName, setFileName] = useState<string>("SOUL.md");
  const [fileContent, setFileContent] = useState<string>("");
  const [cronJobs, setCronJobs] = useState<unknown[]>([]);
  const [teamAgents, setTeamAgents] = useState<Array<{ id: string; identityName?: string }>>([]);
  const [skillsList, setSkillsList] = useState<string[]>([]);

  const teamRecipes = useMemo(
    () => recipes.filter((r) => r.kind === "team"),
    [recipes]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMessage("");
      try {
        const res = await fetch("/api/recipes", { cache: "no-store" });
        const json = await res.json();
        const list = (json.recipes ?? []) as RecipeListItem[];
        setRecipes(list);

        // Prefer a recipe with id matching the teamId; fallback to first team recipe.
        const preferred = list.find((r) => r.kind === "team" && r.id === teamId);
        const fallback = list.find((r) => r.kind === "team");
        const pick = preferred ?? fallback;
        if (pick) setFromId(pick.id);

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
              const entry = f as { name?: unknown; missing?: unknown };
              return { name: String(entry.name ?? ""), missing: Boolean(entry.missing) };
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
        setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [teamId]);

  async function onLoadSource() {
    if (!fromId) return;
    setMessage("");
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(fromId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load recipe");
      const r = json.recipe as RecipeDetail;
      setContent(r.content);
      setMessage(`Loaded source recipe: ${r.id}`);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
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
    setMessage("");
    try {
      const json = await ensureCustomRecipeExists(overwrite);
      setContent(json.content);
      setMessage(`Saved custom team recipe to workspace recipes: ${json.filePath}`);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveMarkdown() {
    const id = toId.trim();
    if (!id) return setMessage("Custom recipe id is required");

    setSaving(true);
    setMessage("");
    try {
      // Ensure the workspace file exists first.
      await ensureCustomRecipeExists(false).catch(() => null);

      const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save markdown failed");
      setMessage(`Saved markdown to ${json.filePath}`);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onLoadTeamFile(name: string) {
    setSaving(true);
    setMessage("");
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
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTeamFile() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/teams/file", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, name: fileName, content: fileContent }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to save file");
      setMessage(`Saved ${fileName}`);
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : String(e));
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
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="ck-glass-strong p-4">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Source team recipe</div>
            <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">From</label>
            <select
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              {teamRecipes.map((r) => (
                <option key={`${r.source}:${r.id}`} value={r.id}>
                  {r.id} ({r.source})
                </option>
              ))}
            </select>
            <button
              onClick={onLoadSource}
              className="mt-3 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
            >
              Load source markdown
            </button>
          </div>

          <div className="ck-glass-strong p-4">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Custom recipe target</div>
            <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">To id</label>
            <input
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />

            <label className="mt-3 block text-xs font-medium text-[color:var(--ck-text-secondary)]">To name</label>
            <input
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />

            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                disabled={saving}
                onClick={() => onSaveCustom(false)}
                className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save (create)"}
              </button>
              <button
                disabled={saving}
                onClick={() => onSaveCustom(true)}
                className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-50"
              >
                Save (overwrite)
              </button>
              <button
                disabled={!content || saving}
                onClick={onSaveMarkdown}
                className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-50"
              >
                Save markdown
              </button>
              <button
                disabled={!content}
                onClick={() => downloadTextFile(`${toId || "custom-team"}.md`, content)}
                className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-50"
              >
                Export recipe (download)
              </button>
            </div>
          </div>

          <div className="ck-glass-strong p-4">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Notes</div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[color:var(--ck-text-secondary)]">
              <li>Saving writes to workspace recipes dir (does not modify builtin recipes).</li>
              <li>Next: structured editing of agents/skills/cron in the markdown body.</li>
            </ul>
          </div>
        </div>
      ) : null}

      {activeTab === "agents" ? (
        <div className="mt-6 ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Agents in this team</div>
          <ul className="mt-3 space-y-2">
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
          <ul className="mt-3 space-y-2">
            {cronJobs.length ? (
              cronJobs.map((j) => {
                const job = j as { id?: unknown; jobId?: unknown; name?: unknown; enabled?: unknown; state?: { enabled?: unknown } };
                const key = String(job.id ?? job.jobId ?? job.name ?? "job");
                const label = String(job.name ?? job.id ?? job.jobId ?? "(unnamed)");
                const enabled = job.enabled ?? job.state?.enabled;
                return (
                  <li key={key} className="text-sm text-[color:var(--ck-text-secondary)]">
                    <div className="font-medium text-[color:var(--ck-text-primary)]">{label}</div>
                    <div className="text-xs">Enabled: {String(enabled ?? "?")}</div>
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
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Team files</div>
            <ul className="mt-3 space-y-1">
              {teamFiles.map((f) => (
                <li key={f.name}>
                  <button
                    onClick={() => onLoadTeamFile(f.name)}
                    className={
                      fileName === f.name
                        ? "w-full rounded-[var(--ck-radius-sm)] bg-white/10 px-3 py-2 text-left text-sm text-[color:var(--ck-text-primary)]"
                        : "w-full rounded-[var(--ck-radius-sm)] px-3 py-2 text-left text-sm text-[color:var(--ck-text-secondary)] hover:bg-white/5"
                    }
                  >
                    {f.name}
                    {f.missing ? " (missing)" : ""}
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

      {message ? (
        <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--ck-text-primary)]">
          {message}
        </div>
      ) : null}

      {/* duplicate markdown editor removed */}
    </div>
  );
}
