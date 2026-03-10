import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ChatMessage, ChatRoom } from "./chat-types";

function isRoomId(v: string): boolean {
  if (v === "team") return true;
  if (v.startsWith("role:")) {
    const role = v.slice("role:".length).trim();
    return Boolean(role) && !role.includes("/") && !role.includes("..") && !role.includes("\\");
  }
  return false;
}

export function resolveRoomFile(teamDir: string, roomId: string): { ok: true; file: string } | { ok: false; error: string } {
  const rid = String(roomId ?? "").trim();
  if (!isRoomId(rid)) return { ok: false, error: `Invalid roomId: ${rid}` };

  if (rid === "team") {
    return { ok: true, file: path.join(teamDir, "shared-context", "chat", "team.jsonl") };
  }

  const role = rid.slice("role:".length).trim();
  return { ok: true, file: path.join(teamDir, "roles", role, "chat.jsonl") };
}

export async function ensureChatFile(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.stat(file);
  } catch {
    await fs.writeFile(file, "", "utf8");
  }
}

export async function listChatRooms(teamDir: string): Promise<{ ok: true; rooms: ChatRoom[] } | { ok: false; error: string }> {
  const rooms: ChatRoom[] = [];

  const team = resolveRoomFile(teamDir, "team");
  if (!team.ok) return team;
  rooms.push({ roomId: "team", label: "Team", file: team.file });

  const rolesDir = path.join(teamDir, "roles");
  try {
    const entries = await fs.readdir(rolesDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const role = ent.name;
      // Skip hidden/system dirs
      if (!role || role.startsWith(".")) continue;
      const rid = `role:${role}`;
      const rr = resolveRoomFile(teamDir, rid);
      if (!rr.ok) continue;
      rooms.push({ roomId: rid, label: `Role: ${role}`, file: rr.file });
    }
  } catch {
    // no roles folder; ignore
  }

  return { ok: true, rooms };
}

export async function readChatHistory(args: {
  teamDir: string;
  roomId: string;
  limit: number;
}): Promise<{ ok: true; messages: ChatMessage[]; file: string } | { ok: false; error: string }> {
  const { teamDir } = args;
  const limit = Math.max(1, Math.min(500, Number(args.limit) || 100));

  const rr = resolveRoomFile(teamDir, args.roomId);
  if (!rr.ok) return rr;
  const file = rr.file;

  await ensureChatFile(file);

  const raw = await fs.readFile(file, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const tail = lines.slice(Math.max(0, lines.length - limit));

  const messages: ChatMessage[] = [];
  for (const line of tail) {
    try {
      const parsed = JSON.parse(line) as ChatMessage;
      if (!parsed || typeof parsed !== "object") continue;
      if (typeof parsed.id !== "string" || typeof parsed.ts !== "string" || typeof parsed.text !== "string") continue;
      messages.push(parsed);
    } catch {
      // ignore malformed line
    }
  }

  return { ok: true, messages, file };
}

export async function appendChatMessage(args: {
  teamDir: string;
  roomId: string;
  text: string;
  author: ChatMessage["author"];
  meta?: ChatMessage["meta"];
}): Promise<{ ok: true; message: ChatMessage; file: string } | { ok: false; error: string }> {
  const rr = resolveRoomFile(args.teamDir, args.roomId);
  if (!rr.ok) return rr;
  const file = rr.file;

  const text = String(args.text ?? "").trimEnd();
  if (!text.trim()) return { ok: false, error: "text is required" };

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    roomId: String(args.roomId),
    author: args.author,
    text,
    meta: args.meta,
  };

  await ensureChatFile(file);
  await fs.appendFile(file, `${JSON.stringify(message)}\n`, "utf8");
  return { ok: true, message, file };
}
