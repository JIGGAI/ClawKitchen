"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";

export type Theme = "light" | "dark";

const STORAGE_KEY = "ck-theme";

function readInitialTheme(): Theme {
  // Default: dark mode.
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggle() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--ck-border-subtle)] bg-white/5 text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[color:var(--ck-bg-soft)]"
      aria-label={label}
      title={label}
    >
      <span className="sr-only" suppressHydrationWarning>
        {label}
      </span>
      {theme === "dark" ? (
        <MoonIcon className="h-4.5 w-4.5" />
      ) : (
        <SunIcon className="h-4.5 w-4.5" />
      )}
    </button>
  );
}
