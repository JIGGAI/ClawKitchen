"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { errorMessage } from "@/lib/errors";

type ChatRoom = { roomId: string; label: string };

type ChatMessage = {
  id: string;
  ts: string;
  roomId: string;
  author: { kind: "human" | "agent"; id: string; label?: string };
  text: string;
};

export function TeamChatTab({ teamId }: { teamId: string }) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string>("team");
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<string>("");
  const [posting, setPosting] = useState(false);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.roomId === activeRoomId) ?? { roomId: activeRoomId, label: activeRoomId },
    [rooms, activeRoomId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingRooms(true);
    setError("");
    fetchJson<{ ok?: boolean; rooms?: ChatRoom[] }>(
      `/api/teams/chat/rooms?teamId=${encodeURIComponent(teamId)}`,
      { cache: "no-store" }
    )
      .then((j) => {
        if (cancelled) return;
        const next = Array.isArray(j.rooms) ? j.rooms : [];
        setRooms(next);
        if (!next.some((r) => r.roomId === activeRoomId)) setActiveRoomId(next[0]?.roomId ?? "team");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingRooms(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- teamId change reloads; activeRoomId is handled best-effort.
  }, [teamId]);

  async function loadHistory(roomId: string) {
    setLoadingHistory(true);
    setError("");
    try {
      const j = await fetchJson<{ ok?: boolean; messages?: ChatMessage[] }>(
        `/api/teams/chat/history?teamId=${encodeURIComponent(teamId)}&roomId=${encodeURIComponent(roomId)}&limit=200`,
        { cache: "no-store" }
      );
      setMessages(Array.isArray(j.messages) ? j.messages : []);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void loadHistory(activeRoomId);
  }, [activeRoomId]);

  async function onPost() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    setError("");
    try {
      await fetchJson(`/api/teams/chat/post`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId, roomId: activeRoomId, text }),
      });
      setDraft("");
      await loadHistory(activeRoomId);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--ck-text-primary)]">Chat (MVP)</div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)]">
            File-first JSONL logs. Websocket streaming + agent poke will land next.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-[color:var(--ck-text-secondary)]">Room</label>
          <select
            value={activeRoomId}
            onChange={(e) => setActiveRoomId(e.target.value)}
            className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 text-sm text-[color:var(--ck-text-primary)]"
            disabled={loadingRooms}
          >
            {(rooms.length ? rooms : [{ roomId: "team", label: "Team" }]).map((r) => (
              <option key={r.roomId} value={r.roomId}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-[var(--ck-radius-sm)] border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mt-4 rounded-[var(--ck-radius-md)] border border-white/10 bg-black/20 p-4">
        <div className="mb-2 text-xs text-[color:var(--ck-text-tertiary)]">{activeRoom.label}</div>

        <div className="max-h-[420px] overflow-auto rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
          {loadingHistory ? (
            <div className="text-sm text-[color:var(--ck-text-secondary)]">Loading…</div>
          ) : messages.length ? (
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="text-xs text-[color:var(--ck-text-tertiary)]">
                      {m.author?.kind}:{m.author?.id}
                    </div>
                    <div className="text-xs text-[color:var(--ck-text-tertiary)]">{new Date(m.ts).toLocaleString()}</div>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-[color:var(--ck-text-primary)]">{m.text}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[color:var(--ck-text-secondary)]">No messages yet.</div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message to ${activeRoom.label}…`}
            className="min-h-[80px] w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 p-2 text-sm text-[color:var(--ck-text-primary)]"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-[color:var(--ck-text-tertiary)]">
              Posting writes to: shared-context/chat/team.jsonl or roles/&lt;role&gt;/chat.jsonl
            </div>
            <button
              onClick={() => void onPost()}
              disabled={posting || !draft.trim()}
              className="rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
