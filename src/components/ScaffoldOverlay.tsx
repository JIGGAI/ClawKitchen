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
  onDismiss,
}: {
  open: boolean;
  step: ScaffoldOverlayStep;
  details?: string;
  onDismiss?: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[500]">
      {/* Full blackout/whiteout to hide the app while gateway/Kitchen may be restarting. */}
      <div className="fixed inset-0 bg-[color:var(--ck-bg)] opacity-100" />
      <div className="fixed inset-0 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[color:var(--ck-bg-glass-strong)] p-8 sm:p-10 shadow-[var(--ck-shadow-2)]">
          <div className="text-2xl font-semibold text-[color:var(--ck-text-primary)]">Claw Kitchen</div>
          <div className="mt-3 text-base text-[color:var(--ck-text-secondary)]">Hang tight — we’re updating your OpenClaw install.</div>

          <div className="mt-8 space-y-4 text-base">
            {[1, 2, 3].map((n) => {
              const s = n as ScaffoldOverlayStep;
              const active = s === step;
              const done = s < step;
              return (
                <div key={s} className="flex items-center gap-4">
                  <div
                    className={
                      "h-3.5 w-3.5 rounded-full " +
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

          <div className="mt-8 flex items-center justify-between gap-3">
            {details ? (
              <details>
                <summary className="cursor-pointer select-none text-xs text-[color:var(--ck-text-tertiary)]">Details</summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-[color:var(--ck-text-secondary)]">
                  {details}
                </pre>
              </details>
            ) : (
              <div />
            )}

            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
