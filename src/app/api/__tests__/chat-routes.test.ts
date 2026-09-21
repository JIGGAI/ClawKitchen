import { beforeEach, describe, expect, it, vi } from "vitest";

const gw = vi.hoisted(() => ({ listeners: [] as ((event: string, payload: unknown) => void)[] }));

vi.mock("@/lib/chat/gateway-client", () => ({
  gatewayRequest: vi.fn(),
  ensureGatewayConnected: vi.fn(async () => {}),
  onGatewayEvent: vi.fn((fn: (event: string, payload: unknown) => void) => {
    gw.listeners.push(fn);
    return () => {
      gw.listeners = gw.listeners.filter((l) => l !== fn);
    };
  }),
}));

import { gatewayRequest } from "@/lib/chat/gateway-client";
import { POST as abort } from "../chat/abort/route";
import { GET as history } from "../chat/history/route";
import { POST as send } from "../chat/send/route";
import { GET as stream } from "../chat/stream/route";
import { GET as listThreads, POST as createThread } from "../chat/threads/route";

const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.mocked(gatewayRequest).mockReset();
  gw.listeners = [];
});

describe("threads", () => {
  it("lists the agent's chat threads", async () => {
    vi.mocked(gatewayRequest).mockResolvedValue({ sessions: [{ key: "agent:main:dashboard:t1", label: "T1", updatedAt: 2 }] });
    const res = await listThreads(new Request("https://k/api/chat/threads?agent=main"));
    expect(gatewayRequest).toHaveBeenCalledWith("sessions.list", {
      agentId: "main",
      limit: 200,
      includeDerivedTitles: true,
      includeLastMessage: true,
    });
    const body = await res.json();
    expect(body.threads.map((t: { key: string }) => t.key)).toEqual(["agent:main:main", "agent:main:dashboard:t1"]);
  });

  it("rejects a bad agent id", async () => {
    const res = await listThreads(new Request("https://k/api/chat/threads?agent=../x"));
    expect(res.status).toBe(400);
    expect(gatewayRequest).not.toHaveBeenCalled();
  });

  it("creates a thread and returns its key", async () => {
    vi.mocked(gatewayRequest).mockResolvedValue({ ok: true, key: "agent:main:dashboard:abc" });
    const res = await createThread(new Request("https://k/api/chat/threads", json({ agent: "main" })));
    expect(gatewayRequest).toHaveBeenCalledWith("sessions.create", { agentId: "main" });
    expect(await res.json()).toEqual({ ok: true, key: "agent:main:dashboard:abc" });
  });
});

describe("history", () => {
  it("returns chat messages and whether a reply is running", async () => {
    vi.mocked(gatewayRequest).mockResolvedValue({
      messages: [{ role: "user", content: "hi", timestamp: 1, __openclaw: { id: "m1" } }],
      sessionInfo: { hasActiveRun: true },
    });
    const res = await history(new Request("https://k/api/chat/history?session=agent:main:main"));
    expect(gatewayRequest).toHaveBeenCalledWith("chat.history", { sessionKey: "agent:main:main", limit: 200 });
    expect(await res.json()).toEqual({ ok: true, running: true, messages: [{ id: "m1", role: "user", text: "hi", ts: 1 }] });
  });

  it("refuses sessions that are not chat threads", async () => {
    const res = await history(new Request("https://k/api/chat/history?session=agent:main:telegram:direct:1"));
    expect(res.status).toBe(400);
  });
});

describe("send / abort", () => {
  it("sends the trimmed message with an idempotency key", async () => {
    vi.mocked(gatewayRequest).mockResolvedValue({ runId: "r1", status: "started" });
    const res = await send(new Request("https://k/api/chat/send", json({ session: "agent:main:main", message: "  hello  " })));
    expect(gatewayRequest).toHaveBeenCalledWith(
      "chat.send",
      { sessionKey: "agent:main:main", message: "hello", idempotencyKey: expect.any(String) },
      60_000,
    );
    expect(await res.json()).toEqual({ ok: true, runId: "r1", status: "started" });
  });

  it("rejects empty messages", async () => {
    const res = await send(new Request("https://k/api/chat/send", json({ session: "agent:main:main", message: "  " })));
    expect(res.status).toBe(400);
  });

  it("aborts the session's run", async () => {
    vi.mocked(gatewayRequest).mockResolvedValue({ ok: true, aborted: true, runIds: ["r1"] });
    const res = await abort(new Request("https://k/api/chat/abort", json({ session: "agent:main:main" })));
    expect(gatewayRequest).toHaveBeenCalledWith("chat.abort", { sessionKey: "agent:main:main" });
    expect(await res.json()).toEqual({ ok: true, aborted: true });
  });

  it("reports gateway failures as 502", async () => {
    vi.mocked(gatewayRequest).mockRejectedValue(new Error("gateway connection closed"));
    const res = await abort(new Request("https://k/api/chat/abort", json({ session: "agent:main:main" })));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("gateway connection closed");
  });
});

describe("stream", () => {
  it("forwards only this session's chat events as server-sent events", async () => {
    const ctrl = new AbortController();
    const res = await stream(new Request("https://k/api/chat/stream?session=agent:main:main", { signal: ctrl.signal }));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toBe(": connected\n\n");

    const emit = (payload: unknown) => gw.listeners.forEach((l) => l("chat", payload));
    emit({ sessionKey: "agent:other:main", state: "final" });
    gw.listeners.forEach((l) => l("tick", {}));
    emit({ sessionKey: "agent:main:main", runId: "r", state: "delta", message: { content: [{ type: "text", text: "po" }] } });
    expect(decoder.decode((await reader.read()).value)).toBe(
      `data: ${JSON.stringify({ type: "delta", runId: "r", text: "po" })}\n\n`,
    );

    ctrl.abort();
    expect((await reader.read()).done).toBe(true);
    expect(gw.listeners).toEqual([]);
  });
});
