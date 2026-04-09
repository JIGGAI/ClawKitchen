import { getTicketMarkdown } from "@/lib/tickets";
import { TicketDetailClient } from "@/app/tickets/TicketDetailClient";

// Ticket detail should always reflect current stage/file; do not cache.
export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticket: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ticket } = await params;
  const sp = await searchParams;
  const team = typeof sp.team === "string" ? sp.team.trim() : "";
  if (!team) {
    return (
      <div className="ck-card p-6">
        <h1 className="text-xl font-semibold tracking-tight">No team selected</h1>
        <p className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">
          Select a team from the sidebar to view tickets.
        </p>
      </div>
    );
  }
  const teamId = team;

  const data = await getTicketMarkdown(teamId, ticket);

  if (!data) {
    return (
      <div className="ck-card p-6">
        <h1 className="text-xl font-semibold tracking-tight">Ticket not found</h1>
        <p className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">
          Couldn’t locate “{ticket}” in backlog/in-progress/testing/done.
        </p>
      </div>
    );
  }

  return (
    <TicketDetailClient
      teamId={teamId}
      ticketId={data.id}
      file={data.file}
      markdown={data.markdown}
      stage={data.stage}
      currentOwner={data.owner}
    />
  );
}
