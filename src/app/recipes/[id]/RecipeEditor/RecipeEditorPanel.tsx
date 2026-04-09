"use client";

import type { ReactNode } from "react";
import { expectedFilesForRole, templateKeyToFileName } from "./recipe-editor-utils";
import type { AgentRecipeFrontmatter, TeamRecipeFrontmatter } from "./types";

function RecipePanelCard({
  title,
  description,
  buttonLabel,
  onButtonClick,
  error,
  children,
}: {
  title: string;
  description: ReactNode;
  buttonLabel: string;
  onButtonClick: () => void;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="ck-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">{title}</div>
          <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">{description}</div>
        </div>
        <button
          type="button"
          onClick={onButtonClick}
          className="shrink-0 rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] active:bg-[var(--ck-accent-red-active)]"
        >
          {buttonLabel}
        </button>
      </div>
      {error ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-[color:var(--ck-text-primary)]">
          Frontmatter parse error: {error}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function TeamRecipeDetails({ fm, recipe }: { fm: TeamRecipeFrontmatter | null; recipe: { id: string } }) {
  return (
    <div className="mt-4 space-y-3">
      <details className="rounded-lg border border-white/10 bg-white/5 p-3" open>
        <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe information</summary>
        <div className="mt-2 space-y-1 text-xs text-[color:var(--ck-text-secondary)]">
          <div><span className="text-[color:var(--ck-text-tertiary)]">Recipe id:</span> {fm?.id ?? recipe.id}</div>
          <div><span className="text-[color:var(--ck-text-tertiary)]">Version:</span> {fm?.version ?? "(unknown)"}</div>
          <div><span className="text-[color:var(--ck-text-tertiary)]">Team id:</span> {fm?.team?.teamId ?? "(not set)"}</div>
          {fm?.description ? <div className="whitespace-pre-wrap">{fm.description}</div> : null}
        </div>
      </details>
      <TeamAgentsDetails fm={fm} />
      <TeamCronDetails fm={fm} />
    </div>
  );
}

function TeamAgentsDetails({ fm }: { fm: TeamRecipeFrontmatter | null }) {
  return (
    <details className="rounded-lg border border-white/10 bg-white/5 p-3">
      <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">
        Agents ({fm?.agents?.length ?? 0})
      </summary>
      <div className="mt-2 space-y-2">
        {(fm?.agents ?? []).map((a, idx) => (
          <details key={`${a.role ?? "agent"}:${idx}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer text-sm text-[color:var(--ck-text-primary)]">
              <span className="font-medium">{a.name ?? a.role ?? "(unnamed)"}</span>
              {a.role ? <span className="text-[color:var(--ck-text-tertiary)]"> — {a.role}</span> : null}
            </summary>
            <div className="mt-2 space-y-1 text-xs text-[color:var(--ck-text-secondary)]">
              <div><span className="text-[color:var(--ck-text-tertiary)]">Role:</span> {a.role ?? "(none)"}</div>
              <div><span className="text-[color:var(--ck-text-tertiary)]">Tools profile:</span> {a.tools?.profile ?? "(default)"}</div>
              <div><span className="text-[color:var(--ck-text-tertiary)]">Allow:</span> {(a.tools?.allow ?? []).length ? (a.tools?.allow ?? []).join(", ") : "(none)"}</div>
              <div><span className="text-[color:var(--ck-text-tertiary)]">Deny:</span> {(a.tools?.deny ?? []).length ? (a.tools?.deny ?? []).join(", ") : "(none)"}</div>
              <div className="pt-1">
                <span className="text-[color:var(--ck-text-tertiary)]">Expected files:</span>{" "}
                {expectedFilesForRole(fm, a.role).length ? expectedFilesForRole(fm, a.role).join(", ") : "(not listed)"}
              </div>
            </div>
          </details>
        ))}
        {(!fm?.agents || fm.agents.length === 0) ? (
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">(No agents listed in frontmatter)</div>
        ) : null}
      </div>
    </details>
  );
}

function TeamCronDetails({ fm }: { fm: TeamRecipeFrontmatter | null }) {
  return (
    <details className="rounded-lg border border-white/10 bg-white/5 p-3">
      <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">
        Cron jobs ({fm?.cronJobs?.length ?? 0})
      </summary>
      <div className="mt-2 space-y-2">
        {(fm?.cronJobs ?? []).map((c, idx) => (
          <details key={`${c.id ?? "cron"}:${idx}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer text-sm text-[color:var(--ck-text-primary)]">
              <span className="font-medium">{c.name ?? c.id ?? "(unnamed)"}</span>
              {c.schedule ? <span className="text-[color:var(--ck-text-tertiary)]"> — {c.schedule}</span> : null}
            </summary>
            <div className="mt-2 space-y-1 text-xs text-[color:var(--ck-text-secondary)]">
              {c.agentId ? <div><span className="text-[color:var(--ck-text-tertiary)]">Agent:</span> {c.agentId}</div> : null}
              {c.channel ? <div><span className="text-[color:var(--ck-text-tertiary)]">Channel:</span> {c.channel}</div> : null}
              {typeof c.enabledByDefault === "boolean" ? (
                <div><span className="text-[color:var(--ck-text-tertiary)]">Enabled by default:</span> {c.enabledByDefault ? "yes" : "no"}</div>
              ) : null}
              {c.message ? (
                <div className="mt-2 whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] text-[color:var(--ck-text-primary)]">{c.message}</div>
              ) : null}
            </div>
          </details>
        ))}
        {(!fm?.cronJobs || fm.cronJobs.length === 0) ? (
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">(No cron jobs listed in frontmatter)</div>
        ) : null}
      </div>
    </details>
  );
}

export function TeamRecipePanelContent({
  recipe,
  fm,
  fmErr,
  onOpenCreateTeam,
}: {
  recipe: { id: string };
  fm: TeamRecipeFrontmatter | null;
  fmErr?: string;
  onOpenCreateTeam: () => void;
}) {
  return (
    <RecipePanelCard
      title="Team recipe"
      description={
        <>
          Create a team from this recipe. Creating a Team runs <code>openclaw recipes scaffold-team</code> with{" "}
          <code>--apply-config</code>.
        </>
      }
      buttonLabel="Create Team"
      onButtonClick={onOpenCreateTeam}
      error={fmErr}
    >
      <TeamRecipeDetails fm={fm} recipe={recipe} />
    </RecipePanelCard>
  );
}

export function AgentRecipePanelContent({
  recipe,
  afm,
  afmErr,
  onOpenCreateAgent,
}: {
  recipe: { id: string };
  afm: AgentRecipeFrontmatter | null;
  afmErr?: string;
  onOpenCreateAgent: () => void;
}) {
  return (
    <RecipePanelCard
      title="Agent recipe"
      description={
        <>
          Create an agent from this recipe. Creating an Agent runs <code>openclaw recipes scaffold</code> with{" "}
          <code>--apply-config</code>.
        </>
      }
      buttonLabel="Create Agent"
      onButtonClick={onOpenCreateAgent}
      error={afmErr}
    >
      <div className="mt-4 space-y-3">
        <details className="rounded-lg border border-white/10 bg-white/5 p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">Recipe information</summary>
          <div className="mt-2 space-y-1 text-xs text-[color:var(--ck-text-secondary)]">
            <div><span className="text-[color:var(--ck-text-tertiary)]">Recipe id:</span> {afm?.id ?? recipe.id}</div>
            <div><span className="text-[color:var(--ck-text-tertiary)]">Version:</span> {afm?.version ?? "(unknown)"}</div>
            {afm?.description ? <div className="whitespace-pre-wrap">{afm.description}</div> : null}
          </div>
        </details>
        <details className="rounded-lg border border-white/10 bg-white/5 p-3">
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--ck-text-primary)]">
            Files ({Object.keys(afm?.templates ?? {}).length})
          </summary>
          <div className="mt-2 space-y-1 text-xs text-[color:var(--ck-text-secondary)]">
            {Object.keys(afm?.templates ?? {}).length ? (
              <ul className="list-disc space-y-1 pl-5">
                {Object.keys(afm?.templates ?? {}).map((k) => (
                  <li key={k}>
                    <span className="font-mono text-[11px]">{k}</span>
                    <span className="text-[color:var(--ck-text-tertiary)]"> → </span>
                    <span className="font-mono text-[11px]">{templateKeyToFileName(k)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[color:var(--ck-text-tertiary)]">(No templates listed in frontmatter)</div>
            )}
          </div>
        </details>
      </div>
    </RecipePanelCard>
  );
}
