"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

function slugifyId(input: string) {
  return String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

type Availability =
  | { state: "empty" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; reason?: string };

export function CreateTeamModal({
  open,
  recipeId,
  recipeName,
  teamId,
  setTeamId,
  installCron,
  setInstallCron,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  recipeId: string;
  recipeName: string;
  teamId: string;
  setTeamId: (v: string) => void;
  installCron: boolean;
  setInstallCron: (v: boolean) => void;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [availability, setAvailability] = useState<Availability>({ state: "empty" });

  const derivedId = useMemo(() => slugifyId(teamName), [teamName]);
  const effectiveId = idTouched ? teamId : derivedId;

  // Keep parent state in sync so the confirm handler uses the effective id.
  useEffect(() => {
    if (!open) return;
    if (!idTouched) setTeamId(derivedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedId, open, idTouched]);

  // Reset modal-local state when opened.
  useEffect(() => {
    if (!open) return;
    setIdTouched(false);
    setTeamName("");
    setAvailability({ state: "empty" });
    setTeamId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Check id availability (debounced).
  useEffect(() => {
    if (!open) return;
    const v = String(effectiveId ?? "").trim();
    if (!v) {
      setAvailability({ state: "empty" });
      return;
    }

    const t = setTimeout(() => {
      void (async () => {
        setAvailability({ state: "checking" });
        try {
          const res = await fetch(`/api/ids/check?kind=team&id=${encodeURIComponent(v)}`, { cache: "no-store" });
          const json = (await res.json()) as { ok?: boolean; available?: boolean; reason?: string };
          if (!res.ok || !json.ok) throw new Error(String((json as { error?: unknown }).error ?? "Failed to check id"));
          if (json.available) setAvailability({ state: "available" });
          else setAvailability({ state: "taken", reason: json.reason });
        } catch {
          // If the check fails, don't block creation; just remove the indicator.
          setAvailability({ state: "empty" });
        }
      })();
    }, 500);

    return () => clearTimeout(t);
  }, [effectiveId, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[color:var(--ck-bg-glass-strong)] p-5 shadow-[var(--ck-shadow-2)]">
            <div className="text-lg font-semibold text-[color:var(--ck-text-primary)]">Create team</div>
            <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
              Create a new team from recipe <code className="font-mono">{recipeId}</code>
              {recipeName ? (
                <>
                  {" "}(<span className="font-medium">{recipeName}</span>)
                </>
              ) : null}
              .
            </p>

            <div className="mt-4">
              <label className="text-sm font-medium text-[color:var(--ck-text-primary)]">Team name</label>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Crypto Team"
                className="mt-2 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
                autoFocus
              />
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium text-[color:var(--ck-text-primary)]">Team id</label>
              <input
                value={effectiveId}
                onChange={(e) => {
                  setIdTouched(true);
                  setTeamId(e.target.value);
                }}
                placeholder="e.g. my-team"
                className={
                  "mt-2 w-full rounded-[var(--ck-radius-sm)] border bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)] " +
                  (availability.state === "available"
                    ? "border-emerald-400/50"
                    : availability.state === "taken"
                      ? "border-red-400/60"
                      : "border-white/10")
                }
              />
              <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
                {availability.state === "taken"
                  ? "That id is already taken."
                  : availability.state === "available"
                    ? "Id is available."
                    : "This will scaffold ~/.openclaw/workspace-<teamId> and add the team to config."}
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-[color:var(--ck-text-secondary)]">
              <input
                type="checkbox"
                checked={installCron}
                onChange={(e) => setInstallCron(e.target.checked)}
              />
              Install cron jobs from this recipe
            </label>

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
                disabled={busy || !effectiveId.trim() || availability.state === "taken" || availability.state === "checking"}
                onClick={onConfirm}
                className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create team"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
