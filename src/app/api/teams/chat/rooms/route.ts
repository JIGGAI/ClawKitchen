import { withTeamContextFromQuery, withStorageError } from "@/lib/api-route-helpers";
import { listChatRooms } from "@/lib/chat/chat-storage";

export async function GET(req: Request) {
  return withTeamContextFromQuery(req, async ({ teamDir }) => {
    return withStorageError(async () => {
      const r = await listChatRooms(teamDir);
      if (!r.ok) return r;
      return { ok: true, rooms: r.rooms };
    });
  });
}

export const dynamic = "force-dynamic";
