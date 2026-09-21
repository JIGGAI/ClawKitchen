import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paths", () => ({
  readOpenClawConfig: vi.fn(async () => ({ gateway: { port: 18789, auth: { token: "secret-token" } } })),
}));

import { readOpenClawConfig } from "@/lib/paths";
import { gatewayRequest, onGatewayEvent } from "@/lib/chat/gateway-client";

type Listener = (ev: { data?: unknown }) => void;

class FakeSocket {
  static readonly OPEN = 1;
  static readonly instances: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  private listeners = new Map<string, Listener[]>();
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    this.readyState = 3;
    this.fire("close", {});
  }
  fire(type: string, ev: { data?: unknown }) {
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.fire("open", {});
  }
  frame(f: unknown) {
    this.fire("message", { data: JSON.stringify(f) });
  }
  last() {
    return this.sent[this.sent.length - 1];
  }
}

async function handshake(sock: FakeSocket) {
  sock.open();
  sock.frame({ type: "event", event: "connect.challenge", payload: { nonce: "n1" } });
  await vi.waitFor(() => expect(sock.sent.length).toBe(1));
  const connect = sock.sent[0];
  sock.frame({ type: "res", id: connect.id, ok: true, payload: { type: "hello-ok" } });
  return connect;
}

beforeEach(() => {
  FakeSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeSocket);
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("clawkitchen.gatewayConnection")];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gateway client", () => {
  it("connects with the token after the challenge, then sends the request and resolves its payload", async () => {
    const pending = gatewayRequest("sessions.list", { agentId: "main" });
    await vi.waitFor(() => expect(FakeSocket.instances.length).toBe(1));
    const sock = FakeSocket.instances[0];
    expect(sock.url).toBe("ws://127.0.0.1:18789");

    const connect = await handshake(sock);
    expect(connect).toMatchObject({
      type: "req",
      method: "connect",
      params: {
        minProtocol: 4,
        maxProtocol: 4,
        client: { id: "gateway-client", mode: "backend" },
        role: "operator",
        scopes: ["operator.read", "operator.write"],
        auth: { token: "secret-token" },
      },
    });

    await vi.waitFor(() => expect(sock.sent.length).toBe(2));
    const req = sock.last();
    expect(req).toMatchObject({ type: "req", method: "sessions.list", params: { agentId: "main" } });
    sock.frame({ type: "res", id: req.id, ok: true, payload: { sessions: [1] } });
    await expect(pending).resolves.toEqual({ sessions: [1] });
  });

  it("rejects with the gateway's error message", async () => {
    const pending = gatewayRequest("chat.send", {});
    await vi.waitFor(() => expect(FakeSocket.instances.length).toBe(1));
    const sock = FakeSocket.instances[0];
    await handshake(sock);
    await vi.waitFor(() => expect(sock.sent.length).toBe(2));
    sock.frame({ type: "res", id: sock.last().id, ok: false, error: { code: "INVALID", message: "sessionKey required" } });
    await expect(pending).rejects.toThrow("sessionKey required");
  });

  it("delivers events to subscribers until they unsubscribe", async () => {
    const seen: string[] = [];
    const off = onGatewayEvent((event) => seen.push(event));
    await vi.waitFor(() => expect(FakeSocket.instances.length).toBe(1));
    const sock = FakeSocket.instances[0];
    await handshake(sock);
    sock.frame({ type: "event", event: "chat", payload: {} });
    off();
    sock.frame({ type: "event", event: "chat", payload: {} });
    expect(seen).toEqual(["chat"]);
  });

  it("fails pending requests when the socket closes, and reconnects on the next call", async () => {
    const first = gatewayRequest("chat.history", {});
    await vi.waitFor(() => expect(FakeSocket.instances.length).toBe(1));
    const sock = FakeSocket.instances[0];
    await handshake(sock);
    await vi.waitFor(() => expect(sock.sent.length).toBe(2));
    sock.close();
    await expect(first).rejects.toThrow("gateway connection closed");

    const second = gatewayRequest("chat.history", {});
    await vi.waitFor(() => expect(FakeSocket.instances.length).toBe(2));
    const sock2 = FakeSocket.instances[1];
    await handshake(sock2);
    await vi.waitFor(() => expect(sock2.sent.length).toBe(2));
    sock2.frame({ type: "res", id: sock2.last().id, ok: true, payload: { messages: [] } });
    await expect(second).resolves.toEqual({ messages: [] });
  });

  it("refuses to connect without a gateway token", async () => {
    vi.mocked(readOpenClawConfig).mockResolvedValueOnce({ gateway: {} } as never);
    await expect(gatewayRequest("sessions.list", {})).rejects.toThrow("Missing gateway token");
    expect(FakeSocket.instances.length).toBe(0);
  });
});
