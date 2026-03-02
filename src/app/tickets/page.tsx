import { listTickets } from "@/lib/tickets";
import { TicketsBoardClient } from "@/app/tickets/TicketsBoardClient";

// Tickets reflect live filesystem state; do not cache.
export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const tickets = await listTickets("development-team");
  return <TicketsBoardClient tickets={tickets} basePath="/tickets" />;
}
