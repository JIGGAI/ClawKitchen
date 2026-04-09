"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { useSlugifiedId } from "@/lib/use-slugified-id";
import { CreateModalShell } from "./CreateModalShell";

function getAvailabilityBorderClass(state: string): string {
  if (state === "available") return "border-emerald-400/50";
  if (state === "taken") return "border-red-400/60";
  return "border-white/10";
}

function getAvailabilityHint(state: string): string {
  if (state === "taken") return "That id is already taken.";
  if (state === "available") return "Id is available.";
  return "This will scaffold ~/.openclaw/workspace/agents/<agentId> and add the agent to config.";
}

type Availability =
  | { state: "empty" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; reason?: string };

/** Sync availability from local arrays (no fetch). Returns null when API check needed. */
function syncAvailability(
  v: string,
  existingRecipeIds: string[],
  existingAgentIds: string[]
): Availability | null {
  if (!v) return { state: "empty" };
  if (existingRecipeIds.includes(v)) return { state: "taken", reason: "recipe-id-collision" };
  if (existingAgentIds.includes(v)) return { state: "taken", reason: "agent-exists" };
  return null;
}

export function CreateAgentModal({
  open,
  recipeId,
  recipeName,
  agentId,
  setAgentId,
  agentName,
  setAgentName,
  existingRecipeIds,
  existingAgentIds,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  recipeId: string;
  recipeName: string;
  agentId: string;
  setAgentId: (v: string) => void;
  agentName: string;
  setAgentName: (v: string) => void;
  existingRecipeIds: string[];
  existingAgentIds: string[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [idTouched, setIdTouched] = useState(false);
  const [apiAvailability, setApiAvailability] = useState<Availability | null>(null);

  const { effectiveId } = useSlugifiedId({
    open,
    name: agentName,
    setName: setAgentName,
    id: agentId,
    setId: setAgentId,
    idTouched,
    setIdTouched,
  });

  const v = String(effectiveId ?? "").trim();
  const syncAvail = useMemo(
    () => (open ? syncAvailability(v, existingRecipeIds, existingAgentIds) : { state: "empty" as const }),
    [open, v, existingRecipeIds, existingAgentIds]
  );

  const availability: Availability = syncAvail ?? apiAvailability ?? { state: "available" };

  useEffect(() => {
    if (!open || syncAvail !== null) return;
    const t = setTimeout(() => {
      void (async () => {
        setApiAvailability({ state: "checking" });
        try {
          const json = await fetchJson<{ ok?: boolean; available?: boolean; reason?: string }>(
            `/api/ids/check?kind=agent&id=${encodeURIComponent(v)}`,
            { cache: "no-store" }
          );
          if (json.available) setApiAvailability({ state: "available" });
          else setApiAvailability({ state: "taken", reason: json.reason });
        } catch {
          setApiAvailability({ state: "available" });
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [open, syncAvail, v]);

  return (
    <CreateModalShell
      open={open}
      title="Create agent"
      recipeId={recipeId}
      recipeName={recipeName}
      error={error}
      busy={busy}
      canConfirm={
        !!effectiveId.trim() &&
        availability.state !== "taken" &&
        availability.state !== "checking"
      }
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="Create agent"
    >
      <div className="mt-4">
        <label className="text-sm font-medium text-[color:var(--ck-text-primary)]">Agent name</label>
        <input
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="e.g. Crypto Onchain"
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
          autoFocus
        />
      </div>

      <div className="mt-4">
        <label className="text-sm font-medium text-[color:var(--ck-text-primary)]">Agent id</label>
        <input
          value={effectiveId}
          onChange={(e) => {
            setIdTouched(true);
            setAgentId(e.target.value);
          }}
          placeholder="e.g. crypto-onchain"
          className={
            "mt-2 w-full rounded-lg border bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)] " +
            getAvailabilityBorderClass(availability.state)
          }
        />
        <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
          {getAvailabilityHint(availability.state)}
        </div>
      </div>
    </CreateModalShell>
  );
}
