"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ScaffoldOverlay, type ScaffoldOverlayStep } from "@/components/ScaffoldOverlay";

type OverlayState = {
  open: boolean;
  step: ScaffoldOverlayStep;
  details?: string;
  startedAt?: number;
};

type OverlayApi = {
  show: (state: { step: ScaffoldOverlayStep; details?: string }) => void;
  setStep: (step: ScaffoldOverlayStep) => void;
  setDetails: (details: string) => void;
  hide: () => void;
  snapshot: () => OverlayState;
};

const STORAGE_KEY = "ck.scaffoldOverlay";

const Ctx = createContext<OverlayApi | null>(null);

function safeParse(raw: string | null): OverlayState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<OverlayState>;
    if (!v || typeof v !== "object") return null;
    if (v.open !== true) return null;
    const step = v.step;
    if (step !== 1 && step !== 2 && step !== 3) return null;
    const startedAt = typeof v.startedAt === "number" ? v.startedAt : undefined;
    return {
      open: true,
      step,
      details: typeof v.details === "string" ? v.details : undefined,
      startedAt,
    };
  } catch {
    return null;
  }
}

export function ScaffoldOverlayProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OverlayState>({ open: false, step: 1, details: "" });

  // On first client mount, restore overlay state across navigations/restarts.
  // But never keep a stale overlay around forever (bad UX if a previous run crashed mid-flight).
  useEffect(() => {
    const restored = safeParse(globalThis?.sessionStorage?.getItem(STORAGE_KEY) ?? null);
    if (!restored) return;

    const ageMs = restored.startedAt ? Date.now() - restored.startedAt : null;
    if (ageMs !== null && ageMs > 2 * 60_000) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }

    setState(restored);
  }, []);

  const persist = useCallback((next: OverlayState) => {
    try {
      if (!globalThis?.sessionStorage) return;
      if (next.open) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const api = useMemo<OverlayApi>(() => {
    return {
      show: ({ step, details }) => {
        const next: OverlayState = { open: true, step, details, startedAt: Date.now() };
        setState(next);
        persist(next);
      },
      setStep: (step) => {
        setState((prev) => {
          const next = { ...prev, open: true, step };
          persist(next);
          return next;
        });
      },
      setDetails: (details) => {
        setState((prev) => {
          const next = { ...prev, open: true, details };
          persist(next);
          return next;
        });
      },
      hide: () => {
        const next: OverlayState = { open: false, step: 1, details: "" };
        setState(next);
        persist(next);
      },
      snapshot: () => state,
    };
  }, [persist, state]);

  return (
    <Ctx.Provider value={api}>
      <ScaffoldOverlay open={state.open} step={state.step} details={state.details} onDismiss={() => api.hide()} />
      {children}
    </Ctx.Provider>
  );
}

export function useScaffoldOverlay() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScaffoldOverlay must be used within ScaffoldOverlayProvider");
  return v;
}
