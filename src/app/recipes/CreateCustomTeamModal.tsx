"use client";

import { useEffect, useMemo, useState } from "react";
import { CreateModalShell } from "./CreateModalShell";
import { fetchJsonWithStatus } from "@/lib/fetch-json";

type LocalAgentCatalogItem =
  | {
      kind: "team-role";
      recipeId: string;
      recipeName?: string;
      roleId: string;
      roleName?: string;
    }
  | {
      kind: "single-agent";
      recipeId: string;
      recipeName?: string;
      description?: string;
    };

type SelectedRole = { agentId: string; roleId: string; displayName: string };

function defaultRoleIdFromAgentId(agentId: string) {
  // Strip any existing team prefix if present; keep it sluggy.
  const id = agentId.split("/").pop() || agentId;
  const last = id.split("-").slice(-1)[0] || id;
  return last.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function normalizeTeamIdInput(v: string) {
  // UX: when the user types spaces, turn them into dashes (live).
  // Also keep it lowercase to match id rules.
  return v.toLowerCase().replace(/\s+/g, "-");
}

function isValidId(id: string) {
  return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(id);
}

function isValidTeamId(id: string) {
  // OpenClaw scaffold-team constraint.
  return isValidId(id) && id.endsWith("-team");
}

export function CreateCustomTeamModal({
  open,
  teamId,
  setTeamId,
  busy,
  error,
  onClose,
  onConfirm,
  onRolesChange,
}: {
  open: boolean;
  teamId: string;
  setTeamId: (v: string) => void;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onRolesChange: (roles: SelectedRole[]) => void;
}) {
  const [catalog, setCatalog] = useState<LocalAgentCatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState<string>("");
  const [selected, setSelected] = useState<Record<string, SelectedRole>>({});

  const [previewMd, setPreviewMd] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchJsonWithStatus<{ ok?: boolean; items?: LocalAgentCatalogItem[]; error?: string }>(
        "/api/recipes/local-agent-catalog",
        { cache: "no-store" },
      );
      if (cancelled) return;
      if (!res.ok) {
        setCatalogError(res.error || "Failed to load local agent catalog");
        return;
      }
      if (!res.data.ok) {
        setCatalogError(res.data.error || "Failed to load local agent catalog");
        return;
      }
      setCatalog(Array.isArray(res.data.items) ? res.data.items : []);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const [availability, setAvailability] = useState<
    | { state: "unknown" }
    | { state: "checking" }
    | { state: "available" }
    | { state: "taken"; reason?: string }
  >({ state: "unknown" });

  const agentChoices = useMemo(() => {
    const needle = catalogQuery.trim().toLowerCase();

    const list = catalog.map((it) => {
      if (it.kind === "team-role") {
        const key = `team:${it.recipeId}:${it.roleId}`;
        const recipeLabel = it.recipeName || it.recipeId;
        const roleLabel = it.roleName ? `${it.roleName} (${it.roleId})` : it.roleId;
        return {
          id: key,
          label: `${recipeLabel} → ${roleLabel}`,
          roleId: it.roleId,
          displayName: it.roleName || `${recipeLabel} ${it.roleId}`,
          haystack: `${it.recipeId} ${it.recipeName || ""} ${it.roleId} ${it.roleName || ""}`.toLowerCase(),
        };
      }

      const key = `agent:${it.recipeId}`;
      const recipeLabel = it.recipeName || it.recipeId;
      const descriptionSuffix = it.description ? ` — ${it.description}` : "";
      return {
        id: key,
        label: `${recipeLabel} (agent recipe: ${it.recipeId})${descriptionSuffix}`,
        roleId: defaultRoleIdFromAgentId(it.recipeId),
        displayName: recipeLabel,
        haystack: `${it.recipeId} ${it.recipeName || ""} ${it.description || ""}`.toLowerCase(),
      };
    });

    const filtered = needle ? list.filter((x) => x.haystack.includes(needle)) : list;

    return filtered
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ haystack: _unusedHaystack, ...rest }) => rest);
  }, [catalog, catalogQuery]);

  const roles = useMemo(() => Object.values(selected), [selected]);

  const teamIdTrimmed = teamId.trim();
  const teamIdError = useMemo(() => {
    if (!open) return null;
    if (!teamIdTrimmed) return "Team id is required.";
    if (!isValidId(teamIdTrimmed)) {
      return "Invalid team id. Use lowercase letters/numbers with - or _ (2-63 chars).";
    }
    if (!teamIdTrimmed.endsWith("-team")) {
      return "Team id must end with -team.";
    }
    if (availability.state === "taken") {
      return `Team id is already taken: ${teamIdTrimmed}`;
    }
    return null;
  }, [open, teamIdTrimmed, availability.state]);

  const roleErrors = useMemo(() => {
    const errors = new Map<string, string>();
    for (const r of roles) {
      const roleId = String(r.roleId ?? "").trim();
      if (!roleId) {
        errors.set(r.agentId, "Role id is required.");
        continue;
      }
      if (!isValidId(roleId)) {
        errors.set(r.agentId, "Invalid role id (lowercase letters/numbers with - or _)." );
      }
    }
    return errors;
  }, [roles]);

  const canConfirm =
    !teamIdError &&
    availability.state !== "checking" &&
    availability.state !== "unknown" &&
    roles.length > 0 &&
    roleErrors.size === 0;

  useEffect(() => {
    if (!open) return;
    onRolesChange(roles);
  }, [open, roles, onRolesChange]);

  // Team id availability check (debounced).
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const t = setTimeout(async () => {
      if (!teamIdTrimmed || !isValidTeamId(teamIdTrimmed)) {
        setAvailability({ state: "unknown" });
        return;
      }

      setAvailability({ state: "checking" });

      const res = await fetchJsonWithStatus<{ ok?: boolean; available?: boolean; reason?: string; error?: string }>(
        `/api/ids/check?kind=team&id=${encodeURIComponent(teamIdTrimmed)}`,
        { cache: "no-store" },
      );

      if (cancelled) return;

      if (!res.ok) {
        setAvailability({ state: "unknown" });
        return;
      }

      if (res.data.ok && res.data.available === true) {
        setAvailability({ state: "available" });
        return;
      }

      setAvailability({ state: "taken", reason: res.data.reason });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, teamIdTrimmed]);

  // Best-effort preview (debounced).
  useEffect(() => {
    if (!open) return;
    if (!canConfirm) return;

    let cancelled = false;
    const t = setTimeout(async () => {
      const baseRecipeId = teamIdTrimmed.endsWith("-team") ? teamIdTrimmed.slice(0, -"-team".length) : teamIdTrimmed;

      const res = await fetchJsonWithStatus<{
        ok?: boolean;
        error?: string;
        md?: string;
        filePath?: string;
      }>("/api/recipes/custom-team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dryRun: true,
          recipeId: baseRecipeId,
          teamId: teamIdTrimmed,
          roles: roles.map((r) => ({ roleId: r.roleId, displayName: r.displayName })),
        }),
      });

      if (cancelled) return;

      if (!res.ok) {
        setPreviewError(res.error);
        setPreviewMd(null);
        setPreviewPath(null);
        return;
      }
      if (!res.data.ok) {
        setPreviewError(res.data.error || "Failed to generate preview");
        setPreviewMd(null);
        setPreviewPath(null);
        return;
      }

      setPreviewError(null);
      setPreviewMd(typeof res.data.md === "string" ? res.data.md : null);
      setPreviewPath(typeof res.data.filePath === "string" ? res.data.filePath : null);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, canConfirm, teamIdTrimmed, roles]);

  return (
    <CreateModalShell
      open={open}
      title="Create custom team"
      recipeId={"(new recipe)"}
      recipeName={"Custom Team"}
      error={error || catalogError}
      busy={busy}
      canConfirm={canConfirm}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="Create team"
    >
      <div className="mt-4">
        <label className="text-sm font-medium text-[color:var(--ck-text-primary)]">Team id</label>
        <input
          value={teamId}
          onChange={(e) => setTeamId(normalizeTeamIdInput(e.target.value))}
          placeholder="e.g. my-team"
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
          autoFocus
        />
        {teamIdError ? <div className="mt-2 text-xs text-red-300">{teamIdError}</div> : null}
        {!teamIdError && teamIdTrimmed ? (
          <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
            {availability.state === "checking" ? "Checking availability…" : null}
            {availability.state === "available" ? "Available." : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Select agents</div>
        <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
          MVP: this creates new team roles that mirror the selected agents&apos; names. You can edit the
          resulting team recipe later.
        </div>

        <div className="mt-3">
          <input
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            placeholder="Search local roles/agents (recipe id, name, role)"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
          />

          <div className="mt-3 max-h-[220px] overflow-auto rounded-lg border border-white/10 bg-white/5 p-3">
            {catalogError ? <div className="text-sm text-red-300">{catalogError}</div> : null}
            {!catalogError && agentChoices.length === 0 ? (
              <div className="text-sm text-[color:var(--ck-text-secondary)]">No local roles/agents found.</div>
            ) : null}
            {!catalogError && agentChoices.length ? (
              <div className="space-y-2">
                {agentChoices.map((a) => {
                  const checked = !!selected[a.id];
                  return (
                    <label key={a.id} className="flex items-start gap-2 text-sm text-[color:var(--ck-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = { ...selected };
                          if (e.target.checked) {
                            next[a.id] = {
                              agentId: a.id,
                              roleId: a.roleId,
                              displayName: a.displayName,
                            };
                          } else {
                            delete next[a.id];
                          }
                          setSelected(next);
                        }}
                      />
                      <span className="min-w-0 break-words">{a.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {roles.length ? (
        <div className="mt-6">
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Role mapping</div>
          <div className="mt-3 space-y-3">
            {roles.map((r) => {
              const roleErr = roleErrors.get(r.agentId);
              return (
                <div key={r.agentId} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-[color:var(--ck-text-tertiary)]">{r.agentId}</div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Role id</label>
                      <input
                        value={r.roleId}
                        onChange={(e) => {
                          setSelected((prev) => ({
                            ...prev,
                            [r.agentId]: { ...prev[r.agentId], roleId: e.target.value },
                          }));
                        }}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                      />
                      {roleErr ? <div className="mt-1 text-xs text-red-300">{roleErr}</div> : null}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-[color:var(--ck-text-secondary)]">Display name</label>
                      <input
                        value={r.displayName}
                        onChange={(e) => {
                          setSelected((prev) => ({
                            ...prev,
                            [r.agentId]: { ...prev[r.agentId], displayName: e.target.value },
                          }));
                        }}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">Preview</div>
        <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
          Generated recipe preview (best-effort). This is what will be written to
          <code className="ml-1">~/.openclaw/workspace/recipes/&lt;teamId&gt;.md</code>.
        </div>
        {canConfirm && previewError ? <div className="mt-2 text-xs text-red-300">{previewError}</div> : null}
        {canConfirm && previewPath ? (
          <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
            Target path: <code>{previewPath}</code>
          </div>
        ) : null}
        <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-[color:var(--ck-text-secondary)]">
          {canConfirm ? previewMd || "(Loading preview…)" : "(Select a valid team id and at least one agent to preview.)"}
        </pre>
      </div>
    </CreateModalShell>
  );
}
