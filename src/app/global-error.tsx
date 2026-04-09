"use client";

import { useEffect } from "react";

// NOTE: Next.js renders this when the root layout (or anything above the segment
// error boundary) throws. Keep it dependency-light: no AppShell / no router hooks.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[color:var(--ck-bg)] text-[color:var(--ck-text-primary)]">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
            An unexpected error occurred.
          </p>

          <pre className="mt-6 overflow-auto rounded-md border border-[color:var(--ck-border-subtle)] bg-white/5 p-4 text-xs text-[color:var(--ck-text-secondary)]">
            {String(error?.stack || error)}
          </pre>

          {error?.digest ? (
            <p className="mt-3 text-xs text-[color:var(--ck-text-secondary)]">
              Digest: {error.digest}
            </p>
          ) : null}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-[var(--ck-accent-red)] px-4 py-2 text-sm font-medium text-white"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
