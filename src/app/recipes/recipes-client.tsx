"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScaffoldOverlay, type ScaffoldOverlayStep } from "@/components/ScaffoldOverlay";
import { useToast } from "@/components/ToastProvider";
import { CreateTeamModal } from "./CreateTeamModal";
import { CreateAgentModal } from "./CreateAgentModal";
import { DeleteRecipeModal } from "./DeleteRecipeModal";

type Recipe = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

function RecipesSection({
  title,
  items,
  onDelete,
  onCreateTeam,
  onCreateAgent,
  installedAgentIds,
}: {
  title: string;
  items: Recipe[];
  onDelete?: (id: string) => void;
  onCreateTeam?: (r: Recipe) => void;
  onCreateAgent?: (r: Recipe) => void;
  installedAgentIds: string[];
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ck-text-primary)]">{title}</h2>

      {items.length === 0 ? (
        <div className="mt-3 ck-glass px-4 py-3 text-sm text-[color:var(--ck-text-secondary)]">None yet.</div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((r) => {
            const isInstalledAgent = r.kind === "agent" && installedAgentIds.includes(r.id);
            const editHref = isInstalledAgent
              ? `/agents/${encodeURIComponent(r.id)}`
              : `/recipes/${encodeURIComponent(r.id)}`;
            const editLabel = isInstalledAgent
              ? "Edit agent"
              : r.source === "builtin"
                ? "View recipe"
                : "Edit recipe";

            return (
              <div
                key={`${r.source}:${r.id}`}
                className="ck-glass flex flex-col gap-3 px-4 py-3"
              >
                <div>
                  <div className="font-medium text-[color:var(--ck-text-primary)] whitespace-normal break-words">
                    {r.name}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--ck-text-secondary)]">
                    <span className="font-mono">{r.id}</span> • {r.kind} • {r.source}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {r.kind === "team" && onCreateTeam ? (
                    <button
                      type="button"
                      onClick={() => onCreateTeam(r)}
                      className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
                    >
                      Create team
                    </button>
                  ) : null}

                  {r.kind === "agent" && onCreateAgent ? (
                    <button
                      type="button"
                      onClick={() => onCreateAgent(r)}
                      className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
                    >
                      Create agent
                    </button>
                  ) : null}

                  <Link
                    className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
                    href={editHref}
                  >
                    {editLabel}
                  </Link>

                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function RecipesClient({
  builtin,
  customTeamRecipes,
  customAgentRecipes,
  installedAgentIds,
}: {
  builtin: Recipe[];
  customTeamRecipes: Recipe[];
  customAgentRecipes: Recipe[];
  installedAgentIds: string[];
}) {
  const toast = useToast();

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayStep, setOverlayStep] = useState<ScaffoldOverlayStep>(1);
  const [overlayDetails, setOverlayDetails] = useState<string>("");
  const router = useRouter();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createRecipe, setCreateRecipe] = useState<Recipe | null>(null);
  const [createTeamId, setCreateTeamId] = useState<string>("");
  const [installCron, setInstallCron] = useState(true);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  const [createAgentRecipe, setCreateAgentRecipe] = useState<Recipe | null>(null);
  const [createAgentId, setCreateAgentId] = useState<string>("");
  const [createAgentName, setCreateAgentName] = useState<string>("");
  const [createAgentBusy, setCreateAgentBusy] = useState(false);
  const [createAgentError, setCreateAgentError] = useState<string | null>(null);

  const onDelete = (id: string) => {
    setDeleteId(id);
    setModalError(null);
    setDeleteOpen(true);
  };

  const onCreateTeam = (r: Recipe) => {
    setCreateRecipe(r);
    setCreateTeamId("");
    setInstallCron(true);
    setCreateError(null);
    setCreateOpen(true);
  };

  const onCreateAgent = (r: Recipe) => {
    setCreateAgentRecipe(r);
    setCreateAgentId("");
    setCreateAgentName("");
    setCreateAgentError(null);
    setCreateAgentOpen(true);
  };

  async function confirmDelete() {
    setBusy(true);
    setModalError(null);
    try {
      const res = await fetch("/api/recipes/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg = String(json.error || "Delete failed");
        if (res.status === 409) {
          setModalError(msg);
          return;
        }
        throw new Error(msg);
      }
      toast.push({ kind: "success", message: `Deleted recipe: ${deleteId}` });
      setDeleteOpen(false);
      window.location.reload();
    } catch (e: unknown) {
      toast.push({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function waitForKitchenHealthy(opts?: { timeoutMs?: number }) {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      try {
        const res = await fetch("/healthz", { cache: "no-store" });
        if (res.ok) return true;
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return false;
  }

  async function waitForTeamPageReady(teamId: string, opts?: { timeoutMs?: number }) {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      try {
        const [recipesRes, metaRes] = await Promise.all([
          fetch("/api/recipes", { cache: "no-store" }),
          fetch(`/api/teams/meta?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
        ]);

        const recipesJson = (await recipesRes.json()) as { recipes?: Array<{ id?: unknown; kind?: unknown }> };
        const list = Array.isArray(recipesJson.recipes) ? recipesJson.recipes : [];
        const hasRecipe = list.some((r) => String(r.id ?? "") === teamId && String(r.kind ?? "") === "team");

        const metaJson = (await metaRes.json()) as { ok?: boolean; missing?: boolean; meta?: unknown };
        const hasMeta = Boolean(metaRes.ok && metaJson.ok && !metaJson.missing);

        // Meta is best-effort provenance. Don't block navigation forever on it.
        // If the recipe exists, the team page can still load and the editor will show provenanceMissing.
        if (hasRecipe && (hasMeta || Date.now() - started > 3_000)) return true;
      } catch {
        // ignore
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    return false;
  }

  async function confirmCreateTeam() {
    const recipe = createRecipe;
    if (!recipe) return;

    const t = createTeamId.trim();
    if (!t) {
      setCreateError("Team id is required.");
      return;
    }
    if (t === recipe.id) {
      setCreateError(`Team id cannot be the same as the recipe id (${recipe.id}). Choose a new team id.`);
      return;
    }

    setCreateBusy(true);
    setCreateError(null);

    setOverlayOpen(true);
    setOverlayStep(1);
    setOverlayDetails("");

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
          cronInstallChoice: installCron ? "yes" : "no",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(String(json.error || "Create team failed"));

      setOverlayStep(2);

      const stderr = typeof json.stderr === "string" ? json.stderr : "";
      if (stderr.trim()) setOverlayDetails(stderr.trim());

      // Some CLI failures currently still surface as { ok: true, stderr: "...Error: ..." }.
      // Treat those as hard failures so we don't navigate into a broken team page.
      if (/Failed to start CLI:/i.test(stderr) || /\bError: /i.test(stderr)) {
        throw new Error(stderr.trim() || "Scaffold failed");
      }

      // If scaffolding changed config, the gateway may need a restart. During restart, new pages
      // will throw transient errors (RSC/markdown fetches/etc.), so keep the overlay up.
      if (/Restart required:/i.test(stderr)) {
        setOverlayStep(3);
        try {
          await fetch("/api/gateway/restart", { method: "POST" });
        } catch {
          // best-effort
        }
        await waitForKitchenHealthy({ timeoutMs: 60_000 });
      }

      // Also wait until the new team's recipe+provenance exist before navigating.
      // This avoids the destination page throwing "raw markdown" load errors.
      await waitForTeamPageReady(t, { timeoutMs: 60_000 });

      toast.push({ kind: "success", message: `Created team: ${t}` });
      setCreateOpen(false);

      // Navigate only after restart/readiness to avoid the ugly error+reload UX.
      router.push(`/teams/${encodeURIComponent(t)}`);

      // Give the next page a beat to mount before removing the overlay.
      setTimeout(() => setOverlayOpen(false), 500);
    } catch (e: unknown) {
      setOverlayOpen(false);
      const msg = e instanceof Error ? e.message : String(e);
      setCreateError(msg);
      toast.push({ kind: "error", message: msg });
    } finally {
      setCreateBusy(false);
    }
  }

  async function confirmCreateAgent() {
    const recipe = createAgentRecipe;
    if (!recipe) return;

    const a = createAgentId.trim();
    if (!a) {
      setCreateAgentError("Agent id is required.");
      return;
    }
    if (a === recipe.id) {
      setCreateAgentError(`Agent id cannot be the same as the recipe id (${recipe.id}). Choose a new agent id.`);
      return;
    }

    setCreateAgentBusy(true);
    setCreateAgentError(null);

    setOverlayOpen(true);
    setOverlayStep(1);
    setOverlayDetails("");

    try {
      const res = await fetch("/api/scaffold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "agent",
          recipeId: recipe.id,
          agentId: a,
          name: createAgentName.trim() || undefined,
          applyConfig: true,
          overwrite: false,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(String(json.error || "Create agent failed"));

      setOverlayStep(2);

      const stderr = typeof json.stderr === "string" ? json.stderr : "";
      if (stderr.trim()) setOverlayDetails(stderr.trim());

      if (/Failed to start CLI:/i.test(stderr) || /\bError: /i.test(stderr)) {
        throw new Error(stderr.trim() || "Scaffold failed");
      }

      if (/Restart required:/i.test(stderr)) {
        setOverlayStep(3);
        try {
          await fetch("/api/gateway/restart", { method: "POST" });
        } catch {
          // best-effort
        }
        await waitForKitchenHealthy({ timeoutMs: 60_000 });
      }

      toast.push({ kind: "success", message: `Created agent: ${a}` });
      setCreateAgentOpen(false);

      router.push(`/agents/${encodeURIComponent(a)}`);
      setTimeout(() => setOverlayOpen(false), 500);
    } catch (e: unknown) {
      setOverlayOpen(false);
      const msg = e instanceof Error ? e.message : String(e);
      setCreateAgentError(msg);
      toast.push({ kind: "error", message: msg });
    } finally {
      setCreateAgentBusy(false);
    }
  }

  return (
    <>
      <ScaffoldOverlay open={overlayOpen} step={overlayStep} details={overlayDetails} />
      <div className="mt-8 space-y-10">
        <section>
          <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ck-text-primary)]">Custom recipes</h2>
          <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            Workspace recipes (editable) — stored under <code className="font-mono">~/.openclaw/workspace/recipes/</code>.
          </p>

          <div className="mt-4 space-y-8">
            <RecipesSection
              title={`Teams (${customTeamRecipes.length})`}
              items={customTeamRecipes}
              onDelete={onDelete}
              onCreateTeam={onCreateTeam}
              installedAgentIds={installedAgentIds}
            />
            <RecipesSection
              title={`Agents (${customAgentRecipes.length})`}
              items={customAgentRecipes}
              onDelete={onDelete}
              onCreateAgent={onCreateAgent}
              installedAgentIds={installedAgentIds}
            />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ck-text-primary)]">Builtin recipes</h2>
          <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">Bundled recipes shipped with the plugin.</p>

          <div className="mt-4">
            <RecipesSection
              title={`All (${builtin.length})`}
              items={builtin}
              onCreateTeam={onCreateTeam}
              onCreateAgent={onCreateAgent}
              installedAgentIds={installedAgentIds}
            />
          </div>
        </section>
      </div>

      <DeleteRecipeModal
        open={deleteOpen}
        recipeId={deleteId}
        busy={busy}
        error={modalError}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />

      <CreateTeamModal
        open={createOpen}
        recipeId={createRecipe?.id ?? ""}
        recipeName={createRecipe?.name ?? ""}
        teamId={createTeamId}
        setTeamId={setCreateTeamId}
        installCron={installCron}
        setInstallCron={setInstallCron}
        busy={createBusy}
        error={createError}
        onClose={() => setCreateOpen(false)}
        onConfirm={confirmCreateTeam}
      />

      <CreateAgentModal
        open={createAgentOpen}
        recipeId={createAgentRecipe?.id ?? ""}
        recipeName={createAgentRecipe?.name ?? ""}
        agentId={createAgentId}
        setAgentId={setCreateAgentId}
        agentName={createAgentName}
        setAgentName={setCreateAgentName}
        existingRecipeIds={[...builtin, ...customTeamRecipes, ...customAgentRecipes].map((r) => r.id)}
        existingAgentIds={installedAgentIds}
        busy={createAgentBusy}
        error={createAgentError}
        onClose={() => setCreateAgentOpen(false)}
        onConfirm={confirmCreateAgent}
      />
    </>
  );
}
