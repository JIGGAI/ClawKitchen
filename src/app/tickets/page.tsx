import { listTickets, listAllTeamsTickets } from "@/lib/tickets";
import { TicketsBoardClient } from "@/app/tickets/TicketsBoardClient";
import { getWorkspaceDir } from "@/lib/paths";

// Tickets reflect live filesystem state; do not cache.
export const dynamic = "force-dynamic";

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const team = typeof sp.team === "string" ? sp.team.trim() : "";

  // No team selected → show tickets from all teams.
  if (!team) {
    const tickets = await listAllTeamsTickets();
    return <TicketsBoardClient tickets={tickets} basePath="/tickets" selectedTeamId={null} />;
  }

  const scope = team === "main" ? await getWorkspaceDir() : team;
  const tickets = await listTickets(scope);

  return <TicketsBoardClient tickets={tickets} basePath="/tickets" selectedTeamId={team} />;
}
