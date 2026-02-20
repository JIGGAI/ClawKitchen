"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/ToastProvider";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={
        "rounded-[var(--ck-radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors " +
        (active
          ? "bg-[var(--ck-accent-red)] text-white"
          : "text-[color:var(--ck-text-secondary)] hover:bg-[color:var(--ck-bg-glass)] hover:text-[color:var(--ck-text-primary)]")
      }
    >
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-[color:var(--ck-border-subtle)] bg-[color:var(--ck-bg-glass)] backdrop-blur-[var(--ck-glass-blur)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Claw Kitchen
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              <NavLink href="/recipes" label="Recipes" />
              <NavLink href="/tickets" label="Tickets" />
              <NavLink href="/goals" label="Goals" />
              {/* Channels hidden for release */}
              <NavLink href="/cron-jobs" label="Cron jobs" />
              <NavLink href="/settings" label="Settings" />
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://github.com/JIGGAI/ClawRecipes/tree/main/docs"
              target="_blank"
              rel="noreferrer"
              className="rounded-[var(--ck-radius-sm)] px-3 py-1.5 text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:bg-[color:var(--ck-bg-glass)] hover:text-[color:var(--ck-text-primary)]"
            >
              Docs
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
    </ToastProvider>
  );
}
