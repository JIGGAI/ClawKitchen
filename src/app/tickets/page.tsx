import { listTickets } from "@/lib/tickets";
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

  // AppShell keeps /tickets synced with the globally selected team via ?team=.
  // If no team is specified, show an empty prompt instead of assuming a hardcoded team.
  if (!team) {
    return <TicketsBoardClient tickets={[]} basePath="/tickets" selectedTeamId={null} />;
  }
  const teamId = team;

  const scope = teamId === "main" ? await getWorkspaceDir() : teamId;
  const tickets = await listTickets(scope);

  return <TicketsBoardClient tickets={tickets} basePath="/tickets" selectedTeamId={team || null} />;
}
