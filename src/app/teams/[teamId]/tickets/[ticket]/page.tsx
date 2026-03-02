import { TicketDetailClient } from "@/app/tickets/TicketDetailClient";
import { getTicketMarkdown } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export default async function TeamTicketDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; ticket: string }>;
}) {
  const { teamId, ticket } = await params;
  const data = await getTicketMarkdown(teamId, ticket);

  if (!data) {
    return (
      <div className="ck-glass p-6">
        <h1 className="text-xl font-semibold tracking-tight">Ticket not found</h1>
        <p className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">
          Couldn’t locate “{ticket}” in backlog/in-progress/testing/done for team “{teamId}”.
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
      backHref={`/teams/${encodeURIComponent(teamId)}/tickets`}
      currentOwner={data.owner}
    />
  );
}
