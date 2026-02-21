"use client";

import { createPortal } from "react-dom";

export type ScaffoldOverlayStep = 1 | 2 | 3;

const stepLabel: Record<ScaffoldOverlayStep, string> = {
  1: "Ordering team…",
  2: "Cooking up agents…",
  3: "Serving them up hot…",
};

export function ScaffoldOverlay({
  open,
  step,
  details,
}: {
  open: boolean;
  step: ScaffoldOverlayStep;
  details?: string;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[500]">
      <div className="fixed inset-0 bg-black/70" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[color:var(--ck-bg-glass-strong)] p-6 shadow-[var(--ck-shadow-2)]">
          <div className="text-lg font-semibold text-[color:var(--ck-text-primary)]">Claw Kitchen</div>
          <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">Hang tight — we’re updating your OpenClaw install.</div>

          <div className="mt-5 space-y-3 text-sm">
            {[1, 2, 3].map((n) => {
              const s = n as ScaffoldOverlayStep;
              const active = s === step;
              const done = s < step;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div
                    className={
                      "h-2.5 w-2.5 rounded-full " +
                      (done
                        ? "bg-emerald-400"
                        : active
                          ? "bg-[var(--ck-accent-red)] animate-pulse"
                          : "bg-white/20")
                    }
                  />
                  <div className={done ? "text-[color:var(--ck-text-secondary)] line-through" : "text-[color:var(--ck-text-primary)]"}>
                    {stepLabel[s]}
                  </div>
                </div>
              );
            })}
          </div>

          {details ? (
            <details className="mt-5">
              <summary className="cursor-pointer select-none text-xs text-[color:var(--ck-text-tertiary)]">Details</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-[color:var(--ck-text-secondary)]">
                {details}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
