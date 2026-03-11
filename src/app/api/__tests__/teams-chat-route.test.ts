import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/paths")>();
  return { ...actual, readOpenClawConfig: vi.fn() };
});

vi.mock("@/lib/chat/chat-storage", () => ({
  listChatRooms: vi.fn(),
  readChatHistory: vi.fn(),
  appendChatMessage: vi.fn(),
}));

import { readOpenClawConfig } from "@/lib/paths";
import { appendChatMessage, listChatRooms, readChatHistory } from "@/lib/chat/chat-storage";
import { GET as getRooms } from "../teams/chat/rooms/route";
import { GET as getHistory } from "../teams/chat/history/route";
import { POST as postMessage } from "../teams/chat/post/route";

describe("team chat routes", () => {
  beforeEach(() => {
    vi.mocked(readOpenClawConfig).mockReset();
    vi.mocked(listChatRooms).mockReset();
    vi.mocked(readChatHistory).mockReset();
    vi.mocked(appendChatMessage).mockReset();

    vi.mocked(readOpenClawConfig).mockResolvedValue({
      agents: { defaults: { workspace: "/agents" } },
    });
  });

  it("returns rooms for a team", async () => {
    vi.mocked(listChatRooms).mockResolvedValue({
      ok: true,
      rooms: [{ roomId: "team", label: "Team", file: "/workspace-demo/shared-context/chat/team.jsonl" }],
    });

    const res = await getRooms(new Request("https://test/api/teams/chat/rooms?teamId=demo"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.rooms).toHaveLength(1);
    expect(listChatRooms).toHaveBeenCalledWith("/workspace-demo");
  });

  it("returns history for a room", async () => {
    vi.mocked(readChatHistory).mockResolvedValue({
      ok: true,
      file: "/workspace-demo/shared-context/chat/team.jsonl",
      messages: [{ id: "1", ts: "2026-03-11T00:00:00.000Z", roomId: "team", author: { kind: "human", id: "kitchen" }, text: "hi" }],
    });

    const res = await getHistory(new Request("https://test/api/teams/chat/history?teamId=demo&roomId=team&limit=50"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages).toHaveLength(1);
    expect(readChatHistory).toHaveBeenCalledWith({
      teamDir: "/workspace-demo",
      roomId: "team",
      limit: 50,
    });
  });

  it("posts a message with the default kitchen author", async () => {
    vi.mocked(appendChatMessage).mockResolvedValue({
      ok: true,
      file: "/workspace-demo/shared-context/chat/team.jsonl",
      message: { id: "1", ts: "2026-03-11T00:00:00.000Z", roomId: "team", author: { kind: "human", id: "kitchen" }, text: "hello" },
    });

    const res = await postMessage(
      new Request("https://test/api/teams/chat/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: "demo", roomId: "team", text: "hello" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(appendChatMessage).toHaveBeenCalledWith({
      teamDir: "/workspace-demo",
      roomId: "team",
      text: "hello",
      author: { kind: "human", id: "kitchen" },
    });
  });

  it("returns 400 when teamId is missing on post", async () => {
    const res = await postMessage(
      new Request("https://test/api/teams/chat/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: "team", text: "hello" }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("teamId is required");
  });
});
