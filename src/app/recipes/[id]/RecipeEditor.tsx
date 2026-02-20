"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parse as parseYaml } from "yaml";

type Recipe = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
  content: string;
  filePath: string | null;
};

type TeamRecipeFrontmatter = {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  kind?: "team";
  source?: string;
  cronJobs?: Array<{
    id?: string;
    name?: string;
    schedule?: string;
    timezone?: string;
    agentId?: string;
    channel?: string;
    to?: string;
    description?: string;
    message?: string;
    enabledByDefault?: boolean;
  }>;
  team?: {
    teamId?: string;
    agents?: Array<{
      role?: string;
      name?: string;
      tools?: {
        profile?: string;
        allow?: string[];
        deny?: string[];
      };
    }>;
  };
  templates?: Record<string, string>;
};

function parseFrontmatter(raw: string): { fm: TeamRecipeFrontmatter | null; error?: string } {
  // Very small, tolerant frontmatter extractor.
  // Expects:
  // ---\n<yaml>\n---\n
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) return { fm: null };

  try {
    const fm = parseYaml(m[1]) as TeamRecipeFrontmatter;
    if (!fm || typeof fm !== "object") return { fm: null };
    return { fm };
  } catch (e) {
    return { fm: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function templateKeyToFileName(key: string): string {
  const suffix = key.split(".").slice(1).join(".");
  switch (suffix) {
    case "soul":
      return "SOUL.md";
    case "agents":
      return "AGENTS.md";
    case "tools":
      return "TOOLS.md";
    case "identity":
      return "IDENTITY.md";
    case "install":
      return "INSTALL.md";
    default:
      return suffix ? `${suffix.toUpperCase()}` : key;
  }
}

function expectedFilesForRole(fm: TeamRecipeFrontmatter | null, role: string | undefined): string[] {
  if (!fm || !role || !fm.templates) return [];
  const keys = Object.keys(fm.templates).filter((k) => k.startsWith(`${role}.`));
  const files = keys.map(templateKeyToFileName);
  // De-dupe while preserving order
  return [...new Set(files)];
}

export default function RecipeEditor({ recipeId }: { recipeId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [content, setContent] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [scaffoldOut, setScaffoldOut] = useState<string>("");

  // Team create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [cronInstallChoice, setCronInstallChoice] = useState<"yes" | "no">("no");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMessage("");
      const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "Failed to load recipe");
        setLoading(false);
        return;
      }
      const r = json.recipe as Recipe;
      setRecipe(r);
      setContent(r.content);
      setLoading(false);
    })();
  }, [recipeId]);

  const canSave = useMemo(() => {
    if (!recipe) return false;
    return recipe.filePath !== null;
  }, [recipe]);

  const teamFrontmatter = useMemo(() => {
    if (!recipe || recipe.kind !== "team") return { fm: null as TeamRecipeFrontmatter | null, error: undefined as string | undefined };
    return parseFrontmatter(content);
  }, [recipe, content]);

  async function onSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setMessage(`Saved to ${json.filePath}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onScaffold() {
    if (!recipe) return;
    setScaffoldOut("");
    setMessage("");
    try {
      const res = await fetch("/api/scaffold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: recipe.kind,
          recipeId: recipe.id,
          applyConfig: false,
          overwrite: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Scaffold failed");
      setScaffoldOut([json.stdout, json.stderr].filter(Boolean).join("\n"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setScaffoldOut(msg);
    }
  }

  function openCreateTeam() {
    setCreateMsg("");
    setTeamId(teamFrontmatter.fm?.team?.teamId || "");
    setCronInstallChoice("no");
    setCreateOpen(true);
  }

  async function onSubmitCreateTeam() {
    if (!recipe || recipe.kind !== "team") return;

    const t = teamId.trim();
    if (!t) {
      setCreateMsg("Team id is required.");
      return;
    }

    setCreating(true);
    setCreateMsg("");

    try {
      const res = await fetch("/api/scaffold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "team",
          recipeId: recipe.id,
          teamId: t,
          applyConfig: true,
          overwrite: false,
          cronInstallChoice,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create Team failed");

      setCreateOpen(false);
      router.push(`/teams/${encodeURIComponent(t)}`);
      router.refresh();
    } catch (e: unknown) {
      setCreateMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="ck-glass mx-auto max-w-4xl p-6">Loading…</div>;
  if (!recipe) return <div className="ck-glass mx-auto max-w-4xl p-6">Not found.</div>;

  const fm = recipe.kind === "team" ? teamFrontmatter.fm : null;
  const fmErr = recipe.kind === "team" ? teamFrontmatter.error : undefined;

  return (
    <div className="ck-glass mx-auto max-w-6xl p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{recipe.name}</h1>
          <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">
            {recipe.id} • {recipe.kind} • {recipe.source}
          </div>
          <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
            Path: {recipe.filePath ?? "(unknown / not writable)"}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onScaffold}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
          >
            Scaffold
          </button>
          <button
            disabled={!canSave || saving}
            onClick={onSave}
            className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--ck-text-primary)]">
          {message}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ck-glass-strong p-4">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe markdown</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-2 h-[70vh] w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 font-mono text-xs text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
            spellCheck={false}
          />
        </div>

        {recipe.kind === "team" ? (
          <div className="ck-glass-strong p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Team recipe</div>
                <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
                  Create a team from this recipe, and preview what will be scaffolded.
                </div>
              </div>
              <button
                type="button"
                onClick={openCreateTeam}
                className="shrink-0 rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)]"
              >
                Create Team
              </button>
            </div>

            {fmErr ? (
              <div className="mt-4 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-xs text-[color:var(--ck-text-primary)]">
                Frontmatter parse error: {fmErr}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              <details className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15 p-3" open>
                <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">
                  Metadata
                </summary>
                <div className="mt-2 space-y-1 text-xs text-[color:var(--ck-text-secondary)]">
                  <div>
                    <span className="text-[color:var(--ck-text-tertiary)]">Recipe id:</span> {fm?.id ?? recipe.id}
                  </div>
                  <div>
                    <span className="text-[color:var(--ck-text-tertiary)]">Version:</span> {fm?.version ?? "(unknown)"}
                  </div>
                  <div>
                    <span className="text-[color:var(--ck-text-tertiary)]">Team id:</span> {fm?.team?.teamId ?? "(not set)"}
                  </div>
                  {fm?.description ? <div className="whitespace-pre-wrap">{fm.description}</div> : null}
                </div>
              </details>

              <details className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15 p-3">
                <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">
                  Agents ({fm?.team?.agents?.length ?? 0})
                </summary>
                <div className="mt-2 space-y-2">
                  {(fm?.team?.agents ?? []).map((a, idx) => (
                    <details
                      key={`${a.role ?? "agent"}:${idx}`}
                      className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3"
                    >
                      <summary className="cursor-pointer text-sm text-[color:var(--ck-text-primary)]">
                        <span className="font-medium">{a.name ?? a.role ?? "(unnamed)"}</span>
                        {a.role ? <span className="text-[color:var(--ck-text-tertiary)]"> — {a.role}</span> : null}
                      </summary>
                      <div className="mt-2 space-y-1 text-xs text-[color:var(--ck-text-secondary)]">
                        <div>
                          <span className="text-[color:var(--ck-text-tertiary)]">Role:</span> {a.role ?? "(none)"}
                        </div>
                        <div>
                          <span className="text-[color:var(--ck-text-tertiary)]">Tools profile:</span> {a.tools?.profile ?? "(default)"}
                        </div>
                        <div>
                          <span className="text-[color:var(--ck-text-tertiary)]">Allow:</span>{" "}
                          {(a.tools?.allow ?? []).length ? (a.tools?.allow ?? []).join(", ") : "(none)"}
                        </div>
                        <div>
                          <span className="text-[color:var(--ck-text-tertiary)]">Deny:</span>{" "}
                          {(a.tools?.deny ?? []).length ? (a.tools?.deny ?? []).join(", ") : "(none)"}
                        </div>

                        <div className="pt-1">
                          <span className="text-[color:var(--ck-text-tertiary)]">Expected files:</span>{" "}
                          {expectedFilesForRole(fm, a.role).length
                            ? expectedFilesForRole(fm, a.role).join(", ")
                            : "(not listed)"}
                        </div>
                      </div>
                    </details>
                  ))}
                  {(!fm?.team?.agents || fm.team.agents.length === 0) ? (
                    <div className="text-xs text-[color:var(--ck-text-tertiary)]">(No agents listed in frontmatter)</div>
                  ) : null}
                </div>
              </details>

              <details className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15 p-3">
                <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">
                  Cron jobs ({fm?.cronJobs?.length ?? 0})
                </summary>
                <div className="mt-2 space-y-2">
                  {(fm?.cronJobs ?? []).map((c, idx) => (
                    <details
                      key={`${c.id ?? "cron"}:${idx}`}
                      className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3"
                    >
                      <summary className="cursor-pointer text-sm text-[color:var(--ck-text-primary)]">
                        <span className="font-medium">{c.name ?? c.id ?? "(unnamed)"}</span>
                        {c.schedule ? <span className="text-[color:var(--ck-text-tertiary)]"> — {c.schedule}</span> : null}
                      </summary>
                      <div className="mt-2 space-y-1 text-xs text-[color:var(--ck-text-secondary)]">
                        {c.agentId ? (
                          <div>
                            <span className="text-[color:var(--ck-text-tertiary)]">Agent:</span> {c.agentId}
                          </div>
                        ) : null}
                        {c.channel ? (
                          <div>
                            <span className="text-[color:var(--ck-text-tertiary)]">Channel:</span> {c.channel}
                          </div>
                        ) : null}
                        {typeof c.enabledByDefault === "boolean" ? (
                          <div>
                            <span className="text-[color:var(--ck-text-tertiary)]">Enabled by default:</span>{" "}
                            {c.enabledByDefault ? "yes" : "no"}
                          </div>
                        ) : null}
                        {c.message ? (
                          <div className="mt-2 whitespace-pre-wrap rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 text-[11px] text-[color:var(--ck-text-primary)]">
                            {c.message}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ))}
                  {(!fm?.cronJobs || fm.cronJobs.length === 0) ? (
                    <div className="text-xs text-[color:var(--ck-text-tertiary)]">(No cron jobs listed in frontmatter)</div>
                  ) : null}
                </div>
              </details>

              <details className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/15 p-3">
                <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">
                  Scaffold output
                </summary>
                <pre className="mt-2 h-[30vh] w-full overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 text-xs text-[color:var(--ck-text-primary)]">
                  {scaffoldOut || "(no output yet)"}
                </pre>
              </details>

              <p className="text-xs text-[color:var(--ck-text-tertiary)]">
                Create Team runs <code>openclaw recipes scaffold-team</code> with <code>--apply-config</code>.
              </p>
            </div>
          </div>
        ) : (
          <div className="ck-glass-strong p-4">
            <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Scaffold output</div>
            <pre className="mt-2 h-[70vh] w-full overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-3 text-xs text-[color:var(--ck-text-primary)]">
              {scaffoldOut || "(no output yet)"}
            </pre>
          </div>
        )}
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="ck-glass w-full max-w-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold tracking-tight">Create Team</div>
                <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">From recipe: {recipe.id}</div>
              </div>
              <button
                type="button"
                onClick={() => (!creating ? setCreateOpen(false) : null)}
                className="rounded-[var(--ck-radius-sm)] px-2 py-1 text-sm text-[color:var(--ck-text-secondary)] hover:text-[color:var(--ck-text-primary)]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Team id</div>
                <input
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  placeholder="e.g. acme"
                  className="mt-2 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                  disabled={creating}
                />
              </label>

              <label className="block">
                <div className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Install cron jobs</div>
                <select
                  value={cronInstallChoice}
                  onChange={(e) => setCronInstallChoice(e.target.value as "yes" | "no")}
                  className="mt-2 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                  disabled={creating}
                >
                  <option value="no">No (recommended)</option>
                  <option value="yes">Yes</option>
                </select>
                <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
                  Kitchen scaffolds non-interactively; this controls the one-time cron install choice for this run.
                </div>
              </label>

              {createMsg ? (
                <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm">{createMsg}</div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setCreateOpen(false)}
                  className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={onSubmitCreateTeam}
                  className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)] disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create Team"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-[color:var(--ck-text-tertiary)]">
        Phase 1: Scaffold button runs <code>openclaw recipes scaffold</code> or <code>scaffold-team</code>. The right panel adds a
        lightweight preview for team recipes (agents + cron jobs) and a Create Team flow.
      </p>
    </div>
  );
}
