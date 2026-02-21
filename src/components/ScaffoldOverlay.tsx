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
  onDismiss,
}: {
  open: boolean;
  step: ScaffoldOverlayStep;
  onDismiss?: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Slightly transparent full-screen overlay so we hide the app while still showing a hint of context. */}
      <div className="fixed inset-0 bg-white/90 dark:bg-black/90 pointer-events-none" />

      {onDismiss ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          className="fixed right-4 top-4 z-[10000] rounded-full border border-white/10 bg-[color:var(--ck-bg-glass)] px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] hover:bg-[color:var(--ck-bg-glass-strong)]"
          aria-label="Dismiss loading overlay"
          title="Dismiss"
        >
          Esc
        </button>
      ) : null}

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
                      "h-4 w-4 rounded-full " +
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

          {/* Details removed — avoid noisy/scrolling stderr in the primary UX. */}
        </div>
      </div>
    </div>,
    document.body,
  );
}
