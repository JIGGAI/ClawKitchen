"use client";

import React from "react";
import Link from "next/link";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * React Error Boundary for graceful crash handling.
 * Catches runtime errors in child components and shows a fallback UI.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="ck-card mx-auto max-w-2xl p-6 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--ck-text-primary)]">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
            An unexpected error occurred. You can try refreshing the page or go back home.
          </p>
          <pre className="mt-4 overflow-auto rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-xs text-[color:var(--ck-text-secondary)]">
            {this.state.error.message}
          </pre>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-[var(--ck-accent-red)] px-4 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] hover:bg-[var(--ck-accent-red)]/90"
            >
              Refresh page
            </button>
            <Link
              href="/"
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] hover:bg-white/10"
            >
              Go home
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
