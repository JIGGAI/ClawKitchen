"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScaffoldOverlay, type ScaffoldOverlayStep } from "@/components/ScaffoldOverlay";
import { fetchJsonWithStatus } from "@/lib/fetch-json";
import { pollUntil } from "@/lib/poll";
import { fetchScaffold } from "@/lib/scaffold-client";
import { useToast } from "@/components/ToastProvider";
import { CreateTeamModal } from "./CreateTeamModal";
import { CreateCustomTeamModal } from "./CreateCustomTeamModal";
import { CreateAgentModal } from "./CreateAgentModal";
import { DeleteRecipeModal } from "@/components/delete-modals";
import { errorMessage } from "@/lib/errors";

type Recipe = {
  id: string;
  name: string;
  kind: "agent" | "team";
  source: "builtin" | "workspace";
};

function getEditLabel(isInstalledAgent: boolean, source: string): string {
  if (isInstalledAgent) return "Edit agent";
  if (source === "builtin") return "View recipe";
  return "Edit recipe";
}

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
            const editLabel = getEditLabel(isInstalledAgent, r.source);

            return (
              <div
                key={`${r.source}:${r.id}`}
                className="ck-card flex flex-col gap-3 px-4 py-3"
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
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
                    >
                      Create team
                    </button>
                  ) : null}

                  {r.kind === "agent" && onCreateAgent ? (
                    <button
                      type="button"
                      onClick={() => onCreateAgent(r)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
                    >
                      Create agent
                    </button>
                  ) : null}

                  <Link
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
                    href={editHref}
                  >
                    {editLabel}
                  </Link>

                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
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
  initialOpenCustomTeam = false,
}: {
  builtin: Recipe[];
  customTeamRecipes: Recipe[];
  customAgentRecipes: Recipe[];
  installedAgentIds: string[];
  initialOpenCustomTeam?: boolean;
}) {
  const toast = useToast();

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayStep, setOverlayStep] = useState<ScaffoldOverlayStep>(1);
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

  const [createCustomTeamOpen, setCreateCustomTeamOpen] = useState(initialOpenCustomTeam);
  const [createCustomTeamId, setCreateCustomTeamId] = useState<string>("");
  const [createCustomTeamBusy, setCreateCustomTeamBusy] = useState(false);
  const [createCustomTeamError, setCreateCustomTeamError] = useState<string | null>(null);
  const [customTeamRoles, setCustomTeamRoles] = useState<Array<{ agentId: string; roleId: string; displayName: string }>>(
    [],
  );

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

  const onCreateCustomTeam = () => {
    setCreateCustomTeamId("");
    setCustomTeamRoles([]);
    setCreateCustomTeamError(null);
    setCreateCustomTeamOpen(true);
  };

  async function confirmDelete() {
    setBusy(true);
    setModalError(null);
    try {
      const result = await fetchJsonWithStatus<{ ok?: boolean; error?: string }>("/api/recipes/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deleteId }),
      });
      if (!result.ok) {
        if (result.status === 409) {
          setModalError(result.error);
          return;
        }
        throw new Error(result.error);
      }
      if (!result.data.ok) {
        setModalError(result.data.error ?? "Delete failed");
        return;
      }
      toast.push({ kind: "success", message: `Deleted recipe: ${deleteId}` });
      setDeleteOpen(false);
      window.location.reload();
    } catch (e: unknown) {
      toast.push({ kind: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function waitForKitchenHealthy(opts?: { timeoutMs?: number }) {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const result = await pollUntil<boolean>(
      async () => {
        try {
          const res = await fetch("/healthz", { cache: "no-store" });
          return res.ok ? true : null;
        } catch {
          return null;
        }
      },
      { timeoutMs }
    );
    return result ?? false;
  }

  async function waitForTeamPageReady(teamId: string, opts?: { timeoutMs?: number }) {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const result = await pollUntil<boolean>(
      async () => {
        try {
          const [recipesRes, metaRes] = await Promise.all([
            fetch("/api/recipes", { cache: "no-store" }),
            fetch(`/api/teams/meta?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store" }),
          ]);

          const recipesJson = (await recipesRes.json()) as { recipes?: Array<{ id?: unknown; kind?: unknown }> };
          const list = Array.isArray(recipesJson.recipes) ? recipesJson.recipes : [];
          const hasRecipe = list.some((r) => String(r.id ?? "") === teamId && String(r.kind ?? "") === "team");

          const metaJson = (await metaRes.json()) as { ok?: boolean; missing?: boolean };
          const hasMeta = Boolean(metaRes.ok && metaJson.ok && !metaJson.missing);

          return hasRecipe && hasMeta ? true : null;
        } catch {
          return null;
        }
      },
      { timeoutMs }
    );
    return result ?? false;
  }

  async function attachTeamMeta(teamId: string, recipeId: string, recipeName: string) {
    const res = await fetchJsonWithStatus<{ ok?: boolean; error?: string }>("/api/teams/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId, recipeId, recipeName }),
    });
    if (!res.ok) throw new Error(res.error);
    if (!res.data.ok) throw new Error(res.data.error || "Failed to attach team meta");
  }

  function validateTeamIdForCreate(recipe: { id: string } | null, teamId: string): string | null {
    if (!recipe) return null;
    const t = teamId.trim();
    if (!t) return "Team id is required.";
    if (!t.endsWith("-team")) return "Team id must end with -team.";
    if (t === recipe.id) return `Team id cannot be the same as the recipe id (${recipe.id}). Choose a new team id.`;
    return null;
  }

  async function scaffoldWithOverlay(opts: {
    kind: "team" | "agent";
    recipeId: string;
    teamId?: string;
    agentId?: string;
    name?: string;
    cronInstallChoice?: "yes" | "no";
    setBusy: (v: boolean) => void;
    setError: (v: string | null) => void;
    setModalOpen: (v: boolean) => void;
    setOverlayOpen: (v: boolean) => void;
    setOverlayStep: React.Dispatch<React.SetStateAction<ScaffoldOverlayStep>>;
    successMessage: string;
    navigateTo: string;
    waitBeforeNavigate?: () => Promise<unknown>;
  }) {
    const {
      kind,
      recipeId,
      teamId,
      agentId,
      name,
      cronInstallChoice,
      setBusy,
      setError,
      setModalOpen,
      setOverlayOpen,
      setOverlayStep,
      successMessage,
      navigateTo,
      waitBeforeNavigate,
    } = opts;

    setBusy(true);
    setError(null);
    setModalOpen(false);
    setOverlayOpen(true);
    setOverlayStep(1);

    let serveTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      const body =
        kind === "team"
          ? { kind: "team" as const, recipeId, teamId: teamId!, cronInstallChoice }
          : { kind: "agent" as const, recipeId, agentId: agentId!, name };
      const { res, json } = await fetchScaffold(body);
      if (!res.ok || !(json as { ok?: boolean }).ok)
        throw new Error(
          String((json as { error?: string }).error || (kind === "team" ? "Create team failed" : "Create agent failed"))
        );

      setOverlayStep(2);

      serveTimer = setTimeout(() => {
        setOverlayStep((prev) => (prev < 3 ? 3 : prev));
      }, 20_000);

      const stderr = typeof (json as { stderr?: unknown }).stderr === "string" ? (json as { stderr: string }).stderr : "";

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

      if (waitBeforeNavigate) {
        await waitBeforeNavigate();
      }

      if (serveTimer) clearTimeout(serveTimer);

      toast.push({ kind: "success", message: successMessage });
      setModalOpen(false);

      router.push(navigateTo);

      setTimeout(() => setOverlayOpen(false), 500);
    } catch (e: unknown) {
      if (serveTimer) clearTimeout(serveTimer);
      setOverlayOpen(false);
      const msg = errorMessage(e);
      setError(msg);
      toast.push({ kind: "error", message: msg });
    } finally {
      setBusy(false);
    }
  }

  async function confirmCreateTeam() {
    const recipe = createRecipe;
    const err = validateTeamIdForCreate(recipe, createTeamId);
    if (err) {
      setCreateError(err);
      return;
    }
    if (!recipe) return;

    const t = createTeamId.trim();
    await scaffoldWithOverlay({
      kind: "team",
      recipeId: recipe.id,
      teamId: t,
      cronInstallChoice: installCron ? "yes" : "no",
      setBusy: setCreateBusy,
      setError: setCreateError,
      setModalOpen: setCreateOpen,
      setOverlayOpen,
      setOverlayStep,
      successMessage: `Created team: ${t}`,
      navigateTo: `/teams/${encodeURIComponent(t)}`,
      waitBeforeNavigate: () => waitForTeamPageReady(t, { timeoutMs: 60_000 }),
    });
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

    await scaffoldWithOverlay({
      kind: "agent",
      recipeId: recipe.id,
      agentId: a,
      name: createAgentName.trim() || undefined,
      setBusy: setCreateAgentBusy,
      setError: setCreateAgentError,
      setModalOpen: setCreateAgentOpen,
      setOverlayOpen,
      setOverlayStep,
      successMessage: `Created agent: ${a}`,
      navigateTo: `/agents/${encodeURIComponent(a)}`,
    });
  }

  async function confirmCreateCustomTeam() {
    const teamId = createCustomTeamId.trim();
    if (!teamId) {
      setCreateCustomTeamError("Team id is required.");
      return;
    }
    const recipeId = teamId.endsWith("-team") ? teamId.slice(0, -"-team".length) : teamId;
    if (!recipeId) {
      setCreateCustomTeamError("Team id is invalid.");
      return;
    }
    if (customTeamRoles.length < 1) {
      setCreateCustomTeamError("Select at least one agent.");
      return;
    }

    setCreateCustomTeamError(null);

    try {
      setCreateCustomTeamBusy(true);
      const createRes = await fetchJsonWithStatus<{ ok?: boolean; error?: string; recipeId?: string }>(
        "/api/recipes/custom-team",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            recipeId,
            teamId,
            roles: customTeamRoles.map((r) => ({ roleId: r.roleId, displayName: r.displayName })),
          }),
        },
      );
      setCreateCustomTeamBusy(false);

      if (!createRes.ok) {
        throw new Error(createRes.error);
      }
      if (!createRes.data.ok) {
        throw new Error(createRes.data.error || "Failed to create custom team recipe");
      }

      await scaffoldWithOverlay({
        kind: "team",
        recipeId,
        teamId,
        cronInstallChoice: "no",
        setBusy: setCreateCustomTeamBusy,
        setError: setCreateCustomTeamError,
        setModalOpen: setCreateCustomTeamOpen,
        setOverlayOpen,
        setOverlayStep,
        successMessage: `Created team: ${teamId}`,
        navigateTo: `/teams/${encodeURIComponent(teamId)}`,
        waitBeforeNavigate: async () => {
          // Some scaffold paths may not persist team.json (meta) immediately.
          // Ensure it exists so the team editor loads reliably.
          await attachTeamMeta(teamId, recipeId, "Custom Team");
          await waitForTeamPageReady(teamId, { timeoutMs: 60_000 });
        },
      });
    } catch (e: unknown) {
      setCreateCustomTeamBusy(false);
      const msg = errorMessage(e);
      setCreateCustomTeamError(msg);
      toast.push({ kind: "error", message: msg });
    }
  }

  return (
    <>
      <ScaffoldOverlay
        open={overlayOpen}
        step={overlayStep}
        onDismiss={() => {
          setOverlayOpen(false);
        }}
      />
      <div className="mt-8 space-y-10">
        <section>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ck-text-primary)]">Custom recipes</h2>
              <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
                Workspace recipes (editable) — stored under <code className="font-mono">~/.openclaw/workspace/recipes/</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={onCreateCustomTeam}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-white/10 active:bg-white/15"
            >
              Create custom team
            </button>
          </div>

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

      <CreateCustomTeamModal
        open={createCustomTeamOpen}
        teamId={createCustomTeamId}
        setTeamId={setCreateCustomTeamId}
        busy={createCustomTeamBusy}
        error={createCustomTeamError}
        onRolesChange={setCustomTeamRoles}
        onClose={() => setCreateCustomTeamOpen(false)}
        onConfirm={confirmCreateCustomTeam}
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
