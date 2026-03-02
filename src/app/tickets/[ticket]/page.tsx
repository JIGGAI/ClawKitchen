import { getTicketMarkdown } from "@/lib/tickets";
import { TicketDetailClient } from "@/app/tickets/TicketDetailClient";

// Ticket detail should always reflect current stage/file; do not cache.
export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticket: string }>;
}) {
  const { ticket } = await params;
  const teamId = "development-team";
  const data = await getTicketMarkdown(teamId, ticket);

  if (!data) {
    return (
      <div className="ck-glass p-6">
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
      currentOwner={data.owner}
    />
  );
}
