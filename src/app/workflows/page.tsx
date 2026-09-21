import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { errorMessage } from "@/lib/errors";
import { readManifest } from "@/lib/manifest";
import { listInstalledWorkflows, resolveTeamIds } from "@/lib/workflows/overview";
import WorkflowRunsClient from "./workflow-runs-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const sectionTitle = "text-xs font-semibold uppercase tracking-wider text-[color:var(--ck-text-tertiary)]";

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const sp = await searchParams;
  const team = String((Array.isArray(sp.team) ? sp.team[0] : sp.team) ?? "").trim();

  let teamIds: string[] = [];
  let error: string | null = null;
  try {
    teamIds = await resolveTeamIds(team);
  } catch (e) {
    error = errorMessage(e);
  }

  const [installed, manifest] = await Promise.all([listInstalledWorkflows(teamIds), readManifest()]);
  const teamNames: Record<string, string> = {};
  for (const [id, entry] of Object.entries(manifest?.teams ?? {})) {
    if (entry.displayName) teamNames[id] = entry.displayName;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
          {team ? `${teamNames[team] ?? team} · ` : "All teams · "}
          Every run drawn as the graph it is. A node waiting on you can be answered here.
        </p>
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
      </div>

      <section>
        {installed.length === 0 ? (
          <>
            <h2 className={sectionTitle}>Installed</h2>
            <div className="ck-card mt-3 p-4 text-sm text-[color:var(--ck-text-tertiary)]">
              No workflows yet. Create one from a team&apos;s Workflows tab.
            </div>
          </>
        ) : (
          // Collapsed by default: a real install has dozens of workflows, and
          // left open they push the runs waiting on you below the fold.
          <details className="group ck-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <span className={sectionTitle}>Installed</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]">
                  {installed.length} workflow{installed.length === 1 ? "" : "s"}
                </span>
              </span>
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-[color:var(--ck-text-tertiary)] transition-transform group-open:rotate-90"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </summary>
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
              {installed.map((wf) => (
                <Link
                  key={`${wf.teamId}/${wf.id}`}
                  href={`/teams/${encodeURIComponent(wf.teamId)}/workflows/${encodeURIComponent(wf.id)}`}
                  className="ck-card block p-4 transition-colors hover:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{wf.name ?? wf.id}</div>
                      <div className="truncate font-mono text-xs text-[color:var(--ck-text-tertiary)]">{wf.id}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]">
                      {wf.nodeCount} nodes
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--ck-text-tertiary)]">
                    <span>{teamNames[wf.teamId] ?? wf.teamId}</span>
                    {wf.cron.map((expr) => (
                      <span key={expr} className="font-mono">
                        cron {expr}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </details>
        )}
      </section>

      <section>
        <h2 className={sectionTitle}>Runs</h2>
        <WorkflowRunsClient team={team} teamNames={teamNames} />
      </section>
    </div>
  );
}
