/* eslint-disable sonarjs/publicly-writable-directories */
import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { appendChatMessage, listChatRooms, readChatHistory, resolveRoomFile } from "../chat-storage";

async function mkTmpDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "clawkitchen-chat-"));
}

describe("lib/chat chat-storage", () => {
  it("resolveRoomFile rejects invalid room ids", () => {
    expect(resolveRoomFile("/tmp/team", "").ok).toBe(false);
    expect(resolveRoomFile("/tmp/team", "role:").ok).toBe(false);
    expect(resolveRoomFile("/tmp/team", "role:../dev").ok).toBe(false);
    expect(resolveRoomFile("/tmp/team", "role:dev/../x").ok).toBe(false);
    expect(resolveRoomFile("/tmp/team", "role:dev\\x").ok).toBe(false);
  });

  it("resolveRoomFile maps team + role rooms to canonical jsonl files", () => {
    expect(resolveRoomFile("/tmp/team", "team")).toEqual({
      ok: true,
      file: "/tmp/team/shared-context/chat/team.jsonl",
    });
    expect(resolveRoomFile("/tmp/team", "role:dev")).toEqual({
      ok: true,
      file: "/tmp/team/roles/dev/chat.jsonl",
    });
  });

  it("listChatRooms includes team + role rooms", async () => {
    const teamDir = await mkTmpDir();

    await fs.mkdir(path.join(teamDir, "roles", "dev"), { recursive: true });
    await fs.mkdir(path.join(teamDir, "roles", "qa"), { recursive: true });

    const r = await listChatRooms(teamDir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.rooms.map((x) => x.roomId)).toEqual(["team", "role:dev", "role:qa"]);
  });

  it("appendChatMessage writes jsonl and readChatHistory returns tail", async () => {
    const teamDir = await mkTmpDir();

    const a1 = await appendChatMessage({
      teamDir,
      roomId: "team",
      text: "hello",
      author: { kind: "human", id: "rj" },
    });
    expect(a1.ok).toBe(true);

    const a2 = await appendChatMessage({
      teamDir,
      roomId: "team",
      text: "world",
      author: { kind: "human", id: "rj" },
    });
    expect(a2.ok).toBe(true);

    const h1 = await readChatHistory({ teamDir, roomId: "team", limit: 1 });
    expect(h1.ok).toBe(true);
    if (!h1.ok) return;
    expect(h1.messages).toHaveLength(1);
    expect(h1.messages[0]?.text).toBe("world");
  });
});
