"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { dispatchSelectedTeamChanged } from "@/lib/selected-team";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { fetchJson } from "@/lib/fetch-json";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/ToastProvider";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="grid size-7 place-items-center text-[color:var(--ck-text-secondary)]"
      aria-hidden
    >
      {children}
    </span>
  );
}

function SideNavLink({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={
        (
          active
            ? "flex items-center rounded-[var(--ck-radius-sm)] bg-white/10 text-sm font-medium text-[color:var(--ck-text-primary)]"
            : "flex items-center rounded-[var(--ck-radius-sm)] text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:bg-white/5 hover:text-[color:var(--ck-text-primary)]"
        ) +
        (collapsed ? " justify-center px-0 py-3" : " gap-4 px-4 py-3")
      }
    >
      {icon}
      {collapsed ? null : <span>{label}</span>}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const teamIdFromPath = useMemo(() => {
    const m = pathname.match(/^\/teams\/([^/]+)(?:\/|$)/);
    return m ? decodeURIComponent(m[1]) : null;
  }, [pathname]);

  const isTeamEditorRoute = useMemo(() => pathname.startsWith("/teams/"), [pathname]);

  const [storedTeamId, setStoredTeamId] = useState<string>("");

  const selectedTeamId = (teamIdFromPath || storedTeamId).trim();

  function withTeamQuery(href: string, teamId: string): string {
    const [pathPart, qs] = href.split("?");
    const sp = new URLSearchParams(qs ?? "");
    sp.set("team", teamId);
    return `${pathPart}?${sp.toString()}`;
  }

  function navHref(href: string): string {
    if (!selectedTeamId) return href;
    // Only carry team context for pages that currently support it.
    if (href === "/tickets" || href === "/goals" || href === "/cron-jobs" || href === "/runs") {
      return withTeamQuery(href, selectedTeamId);
    }
    return href;
  }

  function syncTeamToCurrentUrl(teamId: string) {
    // Team editor routes already encode team in the path.
    if (pathname.startsWith("/teams/")) return;
    // Only enforce on pages that support it.
    if (pathname !== "/tickets" && pathname !== "/goals" && pathname !== "/cron-jobs" && pathname !== "/runs") return;

    try {
      const url = new URL(window.location.href);

      if (!teamId) {
        if (!url.searchParams.has("team")) return;
        url.searchParams.delete("team");
        const qs = url.searchParams.toString();
        router.replace(url.pathname + (qs ? `?${qs}` : ""));
        return;
      }

      if ((url.searchParams.get("team") ?? "").trim() === teamId) return;
      url.searchParams.set("team", teamId);
      router.replace(url.pathname + "?" + url.searchParams.toString());
    } catch {
      // ignore
    }
  }

  // Load persisted selected team after hydration to avoid SSR/client mismatch.
  useEffect(() => {
    try {
      setStoredTeamId((localStorage.getItem("ck-selected-team") || "").trim());
    } catch {
      // ignore
    }
  }, []);

  // Keep URL in sync with the selected team on pages that support team filtering.
  useEffect(() => {
    if (typeof window === "undefined") return;
    syncTeamToCurrentUrl(selectedTeamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync uses window.location
  }, [pathname, selectedTeamId]);

  // Keep localStorage in sync with the effective selected team (when we can compute it).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (selectedTeamId) localStorage.setItem("ck-selected-team", selectedTeamId);
      else localStorage.removeItem("ck-selected-team");
    } catch {
      // ignore
    }
  }, [selectedTeamId]);

  const [collapsed, setCollapsed] = useState(false);

  // Avoid hydration mismatch: render un-collapsed on the server, then sync from localStorage after mount.
  useEffect(() => {
    try {
      const v = localStorage.getItem("ck-leftnav-collapsed");
       
      setCollapsed(v === "1");
    } catch {
      // ignore
    }
  }, []);



  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("ck-leftnav-collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  // Minimal team list (for switcher). We rely on existing /api/recipes.
  const [teamIds, setTeamIds] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const json = await fetchJson<{ agents?: Array<{ workspace?: string }> }>("/api/agents", { cache: "no-store" });
        const agents = Array.isArray(json.agents)
          ? (json.agents as Array<{ workspace?: string }> )
          : [];

        const s = new Set<string>();
        for (const a of agents) {
          const ws = String(a.workspace ?? "");
          const parts = ws.split("/").filter(Boolean);
          const wsPart = parts.find((p) => p.startsWith("workspace-")) ?? "";
          if (!wsPart) continue;
          const teamId = wsPart.slice("workspace-".length);
          if (teamId && teamId !== "workspace") s.add(teamId);
        }

        setTeamIds(Array.from(s).sort());
      } catch {
        setTeamIds([]);
      }
    })();
  }, []);

  const globalNav = [
    {
      href: `/`,
      label: "Agents",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 11l9-8 9 8" />
            <path d="M5 10v10h14V10" />
          </svg>
        </Icon>
      ),
    },
    {
      href: `/recipes`,
      label: "Recipes",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 4h12v16H6z" />
            <path d="M9 8h6" />
            <path d="M9 12h6" />
          </svg>
        </Icon>
      ),
    },
    {
      href: navHref(`/tickets`),
      label: "Tickets",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16v4a2 2 0 0 1 0 4v4H4v-4a2 2 0 0 0 0-4z" />
          </svg>
        </Icon>
      ),
    },
    {
      href: `/channels`,
      label: "Channels",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
            <path d="M7 9h0" />
          </svg>
        </Icon>
      ),
    },
    {
      href: navHref(`/goals`),
      label: "Goals",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </Icon>
      ),
    },
    {
      href: navHref(`/cron-jobs`),
      label: "Cron jobs",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5" />
          </svg>
        </Icon>
      ),
    },
    {
      href: navHref(`/runs`),
      label: "Runs",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19h16" />
            <path d="M6 16l4-4 3 3 5-7" />
            <circle cx="10" cy="12" r="1" />
            <circle cx="13" cy="15" r="1" />
            <circle cx="18" cy="8" r="1" />
          </svg>
        </Icon>
      ),
    },
    {
      href: `/settings`,
      label: "Settings",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.4 15a7.9 7.9 0 0 0 .1-1l2-1.5-2-3.5-2.4.5a7.8 7.8 0 0 0-1.7-1L13.5 3h-4L8.6 6.5a7.8 7.8 0 0 0-1.7 1L4.5 7l-2 3.5 2 1.5a7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.4-.5a7.8 7.8 0 0 0 1.7 1L10.5 21h4l.9-3.5a7.8 7.8 0 0 0 1.7-1l2.4.5 2-3.5-2-1.5Z" />
          </svg>
        </Icon>
      ),
    },
  ];

  const sideWidth = collapsed ? "w-16" : "w-72";

  return (
    <ToastProvider>
      <div className="flex h-dvh w-dvw overflow-hidden">
        <aside className={`flex shrink-0 flex-col border-r border-[color:var(--ck-border-subtle)] bg-[color:var(--ck-bg-glass)] backdrop-blur-[var(--ck-glass-blur)] ${sideWidth}`}>
          <div className="flex h-14 items-center justify-between gap-2 border-b border-[color:var(--ck-border-subtle)] px-3">
            <Link href="/" className="text-sm font-semibold tracking-tight" title="Home">
              {collapsed ? "CK" : "Claw Kitchen"}
            </Link>
            <button
              onClick={toggleCollapsed}
              className="rounded-[var(--ck-radius-sm)] px-2 py-1 text-sm text-[color:var(--ck-text-secondary)] hover:bg-white/5 hover:text-[color:var(--ck-text-primary)]"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>

          <div className="border-b border-[color:var(--ck-border-subtle)] p-2">
            {collapsed ? (
              <button
                className="w-full rounded-[var(--ck-radius-sm)] bg-white/5 px-2 py-2 text-xs font-medium text-[color:var(--ck-text-secondary)] hover:bg-white/10"
                title={selectedTeamId ? `Team: ${selectedTeamId}` : "Select team"}
                onClick={() => {
                  const id = teamIds[0] || "";
                  if (!id) return;
                  setStoredTeamId(id);
                  try {
                    localStorage.setItem("ck-selected-team", id);
                  } catch {
                    // ignore
                  }

                  syncTeamToCurrentUrl(id);
                }}
              >
                👥
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                  Team
                </div>
                <select
                  value={selectedTeamId ?? ""}
                  disabled={isTeamEditorRoute}
                  onChange={(e) => {
                    const id = (e.target.value || "").trim();
                    setStoredTeamId(id);
                    try {
                      if (id) localStorage.setItem("ck-selected-team", id);
                      else localStorage.removeItem("ck-selected-team");
                    } catch {
                      // ignore
                    }

                    dispatchSelectedTeamChanged();
                    syncTeamToCurrentUrl(id);
                  }}
                  className={
                    "w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]" +
                    (isTeamEditorRoute ? " cursor-not-allowed opacity-60" : "")
                  }
                >
                  <option value="">All teams</option>
                  {teamIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>

                {selectedTeamId ? (
                  <Link
                    href={`/teams/${encodeURIComponent(selectedTeamId)}`}
                    className="px-2 pb-1 text-xs font-medium text-[color:var(--ck-text-tertiary)] hover:text-[color:var(--ck-text-secondary)]"
                  >
                    Edit team
                  </Link>
                ) : null}
              </div>
            )}
          </div>

          <nav className="min-h-0 flex-1 overflow-auto p-2">
            <div className="mt-2 px-2 pb-2 pt-2">
              {/* section label intentionally omitted */}
            </div>
            {globalNav.map((it) => (
              <SideNavLink
                key={it.href}
                href={it.href}
                label={it.label}
                icon={<span aria-hidden>{it.icon}</span>}
                collapsed={collapsed}
                active={(() => {
                  const hrefPath = it.href.split("?")[0];
                  return pathname === hrefPath || pathname.startsWith(hrefPath + "/");
                })()}
              />
            ))}
          </nav>

          <div className="flex items-center justify-between gap-2 border-t border-[color:var(--ck-border-subtle)] p-2">
            <a
              href="https://github.com/JIGGAI/ClawRecipes/tree/main/docs"
              target="_blank"
              rel="noreferrer"
              className={
                collapsed
                  ? "mx-auto rounded-[var(--ck-radius-sm)] px-2 py-2 text-sm text-[color:var(--ck-text-secondary)] hover:bg-white/5 hover:text-[color:var(--ck-text-primary)]"
                  : "rounded-[var(--ck-radius-sm)] px-3 py-2 text-sm font-medium text-[color:var(--ck-text-secondary)] hover:bg-white/5 hover:text-[color:var(--ck-text-primary)]"
              }
              title="Docs"
            >
              {collapsed ? "📖" : "Docs"}
            </a>
            {collapsed ? null : <ThemeToggle />}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <main className="h-full overflow-auto p-4 md:p-6">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}