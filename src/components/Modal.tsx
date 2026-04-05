"use client";

import { createPortal } from "react-dom";

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  if (!open) return null;

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-lg", 
    lg: "max-w-2xl",
    xl: "max-w-4xl"
  };

  const titleId = "modal-title";
  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flex min-h-full items-center justify-center p-4">
          <div className={`w-full ${sizeClasses[size]} rounded-2xl border border-white/10 bg-[color:var(--ck-bg-glass-strong)] p-6 shadow-[var(--ck-shadow-2)]`}>
            <h2 id={titleId} className="text-lg font-semibold text-[color:var(--ck-text-primary)] mb-4">{title}</h2>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}