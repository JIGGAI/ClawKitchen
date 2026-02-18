"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TicketStage, TicketSummary } from "@/lib/tickets";

const STAGES: { key: TicketStage; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "in-progress", label: "In progress" },
  { key: "testing", label: "Testing" },
  { key: "done", label: "Done" },
];

type DateFilter = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";
const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom range" },
];

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(y, mo, day, 0, 0, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatAge(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function handleMoveTicket(
  ticket: TicketSummary,
  to: TicketStage,
  moveFn: (t: TicketSummary, s: TicketStage) => Promise<void>,
  startTransition: (fn: () => void) => void,
  router: { refresh: () => void },
  setError: (msg: string | null) => void
) {
  startTransition(() => {
    moveFn(ticket, to)
      .then(() => router.refresh())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  });
}

export function TicketsBoardClient({ tickets }: { tickets: TicketSummary[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const filteredTickets = useMemo(() => {
    if (dateFilter === "all") return tickets;

    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    let from: Date | null = null;
    let toExclusive: Date | null = null;

    if (dateFilter === "today") {
      from = todayStart;
      toExclusive = new Date(todayStart);
      toExclusive.setDate(toExclusive.getDate() + 1);
    } else if (dateFilter === "yesterday") {
      from = yesterdayStart;
      toExclusive = todayStart;
    } else if (dateFilter === "7d") {
      from = new Date(todayStart);
      from.setDate(from.getDate() - 6); // include today
    } else if (dateFilter === "30d") {
      from = new Date(todayStart);
      from.setDate(from.getDate() - 29); // include today
    } else if (dateFilter === "custom") {
      from = parseDateInput(customFrom);
      const to = parseDateInput(customTo);
      if (to) {
        toExclusive = new Date(to);
        toExclusive.setDate(toExclusive.getDate() + 1);
      }
    }

    return tickets.filter((t) => {
      const updated = new Date(t.updatedAt);
      if (!Number.isFinite(updated.getTime())) return false;
      if (from && updated < from) return false;
      if (toExclusive && updated >= toExclusive) return false;
      return true;
    });
  }, [tickets, dateFilter, customFrom, customTo]);

  const byStage = useMemo(() => {
    const map: Record<TicketStage, TicketSummary[]> = {
      backlog: [],
      "in-progress": [],
      testing: [],
      done: [],
    };
    for (const t of filteredTickets) map[t.stage].push(t);
    for (const s of Object.keys(map) as TicketStage[]) {
      map[s].sort((a, b) => a.number - b.number);
    }
    return map;
  }, [filteredTickets]);

  async function move(ticket: TicketSummary, to: TicketStage) {
    setError(null);
    const res = await fetch("/api/tickets/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: ticket.id, to }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? `Move failed (${res.status})`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[color:var(--ck-text-secondary)]">
            Time
            <select
              className="ml-2 rounded border border-[color:var(--ck-border-subtle)] bg-transparent px-2 py-1 text-xs"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            >
              {DATE_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {dateFilter === "custom" ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-[color:var(--ck-text-secondary)]">
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="ml-2 rounded border border-[color:var(--ck-border-subtle)] bg-transparent px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs text-[color:var(--ck-text-secondary)]">
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="ml-2 rounded border border-[color:var(--ck-border-subtle)] bg-transparent px-2 py-1 text-xs"
                />
              </label>
            </div>
          ) : null}

          <div className="text-sm text-[color:var(--ck-text-secondary)]">{isPending ? "Updating…" : ""}</div>
        </div>
      </div>

      {error ? (
        <div className="ck-glass border border-[color:var(--ck-border-strong)] p-3 text-sm text-[color:var(--ck-text-primary)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        {STAGES.map(({ key, label }) => (
          <section key={key} className="ck-glass p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">{label}</h2>
              <span className="text-xs text-[color:var(--ck-text-tertiary)]">
                {byStage[key].length}
              </span>
            </div>

            <div className="space-y-2">
              {byStage[key].length === 0 ? (
                <div className="rounded-[var(--ck-radius-sm)] border border-dashed border-[color:var(--ck-border-subtle)] p-3 text-xs text-[color:var(--ck-text-tertiary)]">
                  Empty
                </div>
              ) : null}

              {byStage[key].map((t) => (
                <div
                  key={t.id}
                  className="rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-[color:var(--ck-bg-glass-strong)] p-3"
                >
                  <a
                    href={`/tickets/${encodeURIComponent(t.id)}`}
                    className="block text-sm font-medium text-[color:var(--ck-text-primary)] hover:underline"
                  >
                    {String(t.number).padStart(4, "0")} — {t.title}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--ck-text-secondary)]">
                    <span>{t.owner ? `Owner: ${t.owner}` : "Owner: —"}</span>
                    <span>·</span>
                    <span>Age: {formatAge(t.ageHours)}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <label className="text-xs text-[color:var(--ck-text-tertiary)]">
                      Move
                      <select
                        className="ml-2 rounded border border-[color:var(--ck-border-subtle)] bg-transparent px-2 py-1 text-xs"
                        defaultValue={t.stage}
                        onChange={(e) => {
                          const to = e.target.value as TicketStage;
                          handleMoveTicket(t, to, move, startTransition, router, setError);
                        }}
                      >
                        {STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-[color:var(--ck-text-tertiary)]">
        Source of truth: development-team markdown tickets (via openclaw recipes move-ticket).
      </p>
    </div>
  );
}
