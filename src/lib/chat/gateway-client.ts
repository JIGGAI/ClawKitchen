import { randomUUID } from "node:crypto";
import os from "node:os";
import { readOpenClawConfig } from "@/lib/paths";

/**
 * Kitchen's connection to the OpenClaw gateway. It speaks the same WebSocket
 * protocol as the Control UI, so chat goes through chat.send / chat.history /
 * sessions.* exactly as it does there. One connection per process; the token
 * is read here and never leaves the server.
 */

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
type Listener = (event: string, payload: unknown) => void;
type Frame = { type?: string; id?: string; ok?: boolean; payload?: unknown; error?: unknown; event?: string };

const PROTOCOL = 4;
const CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const SCOPES = ["operator.read", "operator.write"];

export class GatewayRequestError extends Error {}

function errorText(err: unknown): string {
  if (typeof err === "string" && err) return err;
  const message = err && typeof err === "object" ? (err as { message?: unknown }).message : null;
  return typeof message === "string" && message ? message : "gateway request failed";
}

function parseFrame(data: unknown): Frame | null {
  if (typeof data !== "string") return null;
  try {
    const f = JSON.parse(data) as unknown;
    return f && typeof f === "object" ? (f as Frame) : null;
  } catch {
    return null;
  }
}

function connectParams(token: string) {
  return {
    minProtocol: PROTOCOL,
    maxProtocol: PROTOCOL,
    client: { id: "gateway-client", displayName: "ClawKitchen", version: "clawkitchen", platform: os.platform(), mode: "backend" },
    caps: [],
    role: "operator",
    scopes: SCOPES,
    auth: { token },
  };
}

class GatewayConnection {
  readonly listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private ready: Promise<void> | null = null;
  private readonly pending = new Map<string, Pending>();

  connect(): Promise<void> {
    this.ready ??= this.open().catch((err: unknown) => {
      this.ready = null;
      throw err;
    });
    return this.ready;
  }

  async request<T>(method: string, params: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    await this.connect();
    return this.send<T>(method, params, timeoutMs);
  }

  private send<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new GatewayRequestError("gateway is not connected"));
    }
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new GatewayRequestError(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject, timer });
      ws.send(JSON.stringify({ type: "req", id, method, params }));
    });
  }

  private async open(): Promise<void> {
    const cfg = await readOpenClawConfig();
    const token = cfg.gateway?.auth?.token;
    if (!token) throw new GatewayRequestError("Missing gateway token (gateway.auth.token in ~/.openclaw/openclaw.json)");
    const ws = new WebSocket(`ws://127.0.0.1:${cfg.gateway?.port ?? 18789}`);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new GatewayRequestError("gateway connect timed out"));
        ws.close();
      }, CONNECT_TIMEOUT_MS);
      ws.addEventListener("message", (ev) => {
        const frame = parseFrame(ev.data);
        if (!frame) return;
        if (frame.type === "event" && frame.event === "connect.challenge") {
          this.send("connect", connectParams(token), CONNECT_TIMEOUT_MS).then(
            () => {
              clearTimeout(timer);
              resolve();
            },
            (err: Error) => {
              clearTimeout(timer);
              reject(err);
              ws.close();
            },
          );
          return;
        }
        this.dispatch(frame);
      });
      ws.addEventListener("close", () => {
        clearTimeout(timer);
        this.closed(ws);
        reject(new GatewayRequestError("gateway connection closed"));
      });
    });
  }

  private dispatch(frame: Frame) {
    if (frame.type === "res" && frame.id) {
      const p = this.pending.get(frame.id);
      if (!p) return;
      this.pending.delete(frame.id);
      clearTimeout(p.timer);
      if (frame.ok) p.resolve(frame.payload);
      else p.reject(new GatewayRequestError(errorText(frame.error)));
      return;
    }
    if (frame.type === "event" && frame.event) {
      for (const listener of this.listeners) {
        try {
          listener(frame.event, frame.payload);
        } catch {
          // A subscriber's failure is its own; keep delivering to the rest.
        }
      }
    }
  }

  private closed(ws: WebSocket) {
    if (this.ws !== ws) return;
    this.ws = null;
    this.ready = null;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new GatewayRequestError("gateway connection closed"));
      this.pending.delete(id);
    }
  }
}

// One per process — Next bundles each route separately, so a module-level
// singleton would open a socket per route.
const KEY = Symbol.for("clawkitchen.gatewayConnection");

function connection(): GatewayConnection {
  const g = globalThis as unknown as Record<symbol, GatewayConnection | undefined>;
  g[KEY] ??= new GatewayConnection();
  return g[KEY];
}

export function gatewayRequest<T = unknown>(method: string, params: unknown, timeoutMs?: number): Promise<T> {
  return connection().request<T>(method, params, timeoutMs);
}

export function ensureGatewayConnected(): Promise<void> {
  return connection().connect();
}

/** Subscribe to gateway events (connecting if needed). Returns an unsubscribe. */
export function onGatewayEvent(listener: Listener): () => void {
  const c = connection();
  c.listeners.add(listener);
  c.connect().catch(() => {
    // Callers that need the connection await ensureGatewayConnected().
  });
  return () => {
    c.listeners.delete(listener);
  };
}
