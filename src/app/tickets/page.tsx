import { listAllTeamsTickets, listTickets } from "@/lib/tickets";
import { TicketsBoardClient } from "@/app/tickets/TicketsBoardClient";

// Tickets reflect live filesystem state; do not cache.
export const dynamic = "force-dynamic";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams?: {
    team?: string;
  };
}) {
  const rawTeam = typeof searchParams?.team === "string" ? searchParams.team.trim() : "";
  const teamParam = rawTeam && rawTeam !== "all" ? rawTeam : null;

  const tickets = teamParam ? await listTickets(teamParam) : await listAllTeamsTickets();

  return <TicketsBoardClient tickets={tickets} basePath="/tickets" selectedTeamId={teamParam} />;
}
