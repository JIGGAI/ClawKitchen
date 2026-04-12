import { withTeamContextFromQuery, withStorageError } from "@/lib/api-route-helpers";
import { readChatHistory } from "@/lib/chat/chat-storage";

export async function GET(req: Request) {
  return withTeamContextFromQuery(req, async ({ teamDir }) => {
    const { searchParams } = new URL(req.url);
    const roomId = String(searchParams.get("roomId") ?? "team").trim();
    const limit = Number(searchParams.get("limit") ?? 100);

    return withStorageError(async () => {
      const r = await readChatHistory({ teamDir, roomId, limit });
      if (!r.ok) return r;
      return { ok: true, messages: r.messages, file: r.file };
    });
  });
}

export const dynamic = "force-dynamic";
