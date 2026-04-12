import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => {
  const mock = {
    mkdir: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    appendFile: vi.fn(),
    randomUUID: vi.fn(() => "123e4567-e89b-12d3-a456-426614174000"),
    join: (...parts: string[]) => parts.join("/"),
    dirname: (file: string) => file.split("/").slice(0, -1).join("/"),
  };
  return {
    default: mock,
    ...mock,
  };
});

import * as fs from "node:fs/promises";
import {
  appendChatMessage,
  ensureChatFile,
  listChatRooms,
  readChatHistory,
  resolveRoomFile,
} from "@/lib/chat/chat-storage";

describe("chat-storage", () => {
  beforeEach(() => {
    vi.mocked(fs.mkdir).mockReset();
    vi.mocked(fs.stat).mockReset();
    vi.mocked(fs.writeFile).mockReset();
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.appendFile).mockReset();
  });

  it("resolves the team room file", () => {
    expect(resolveRoomFile("/teams/demo", "team")).toEqual({
      ok: true,
      file: "/teams/demo/shared-context/chat/team.jsonl",
    });
  });

  it("resolves role room files and rejects traversal", () => {
    expect(resolveRoomFile("/teams/demo", "role:dev")).toEqual({
      ok: true,
      file: "/teams/demo/roles/dev/chat.jsonl",
    });
    expect(resolveRoomFile("/teams/demo", "role:../oops")).toEqual({
      ok: false,
      error: "Invalid roomId: role:../oops",
    });
  });

  it("creates the chat file when missing", async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await ensureChatFile("/teams/demo/shared-context/chat/team.jsonl");

    expect(fs.mkdir).toHaveBeenCalledWith("/teams/demo/shared-context/chat", { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith("/teams/demo/shared-context/chat/team.jsonl", "", "utf8");
  });

  it("lists team room plus role rooms", async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: "dev", isDirectory: () => true },
      { name: ".gitkeep", isDirectory: () => true },
      { name: "notes.md", isDirectory: () => false },
      { name: "ops", isDirectory: () => true },
    ] as never);

    const result = await listChatRooms("/teams/demo");
    expect(result).toEqual({
      ok: true,
      rooms: [
        { roomId: "team", label: "Team", file: "/teams/demo/shared-context/chat/team.jsonl" },
        { roomId: "role:dev", label: "Role: dev", file: "/teams/demo/roles/dev/chat.jsonl" },
        { roomId: "role:ops", label: "Role: ops", file: "/teams/demo/roles/ops/chat.jsonl" },
      ],
    });
  });

  it("reads only valid messages from the history tail", async () => {
    vi.mocked(fs.stat).mockResolvedValue({} as never);
    vi.mocked(fs.readFile).mockResolvedValue(
      [
        JSON.stringify({ id: "1", ts: "2026-03-11T00:00:00.000Z", text: "old", roomId: "team", author: { kind: "human", id: "a" } }),
        "{bad json}",
        JSON.stringify({ id: "2", ts: "2026-03-11T00:01:00.000Z", text: "new", roomId: "team", author: { kind: "human", id: "b" } }),
        JSON.stringify({ nope: true }),
      ].join("\n")
    );

    const result = await readChatHistory({ teamDir: "/teams/demo", roomId: "team", limit: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toEqual([
      { id: "2", ts: "2026-03-11T00:01:00.000Z", text: "new", roomId: "team", author: { kind: "human", id: "b" } },
    ]);
  });

  it("appends a normalized message", async () => {
    vi.mocked(fs.stat).mockResolvedValue({} as never);
    vi.mocked(fs.appendFile).mockResolvedValue(undefined);

    const result = await appendChatMessage({
      teamDir: "/teams/demo",
      roomId: "team",
      text: "hello   ",
      author: { kind: "human", id: "kitchen" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.text).toBe("hello");
    expect(result.message.roomId).toBe("team");
    expect(result.message.id).toMatch(/[0-9a-f-]{36}/);
    expect(fs.appendFile).toHaveBeenCalledWith(
      "/teams/demo/shared-context/chat/team.jsonl",
      `${JSON.stringify(result.message)}\n`,
      "utf8"
    );
  });

  it("rejects blank messages", async () => {
    const result = await appendChatMessage({
      teamDir: "/teams/demo",
      roomId: "team",
      text: "   \n\t  ",
      author: { kind: "human", id: "kitchen" },
    });

    expect(result).toEqual({ ok: false, error: "text is required" });
  });
});
