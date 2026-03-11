import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Next is already a dependency of ClawKitchen.
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import fsSync from "node:fs";

import { getTeamWorkspaceDir } from "../src/lib/paths";
import { appendChatMessage, ensureChatFile, resolveRoomFile } from "../src/lib/chat/chat-storage";

type KitchenConfig = {
  enabled?: boolean;
  dev?: boolean;
  host?: string;
  port?: number;
  /**
   * Auth protection mode.
   * - on: require authToken for non-localhost binds
   * - local: allow localhost callers unauthenticated
   * - off: disable auth entirely (NOT recommended)
   */
  authMode?: KitchenAuthMode;
  /**
   * Enables HTTP Basic auth when binding to a non-localhost host.
   * Username is fixed to "kitchen"; password is this token.
   */
  authToken?: string;
  /**
   * Optional, disabled-by-default bypass intended ONLY for automated/headless QA.
   * If set, a request may present ?qaToken=... once to receive a short-lived cookie.
   */
  qaToken?: string;
};

type KitchenAuthMode = "on" | "local" | "off";

function parseAuthMode(v: unknown): KitchenAuthMode {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "off") return "off";
  if (s === "local") return "local";
  return "on";
}

function isLocalhost(host: string) {
  const h = (host || "").trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

function isLoopbackRemoteAddress(addr: string | undefined | null) {
  const a = String(addr || "").trim().toLowerCase();
  if (!a) return false;
  // Node often reports IPv4-mapped IPv6 addresses.
  if (a === "::1") return true;
  if (a.startsWith("::ffff:")) {
    const v4 = a.slice("::ffff:".length);
    return v4 === "127.0.0.1";
  }
  return a === "127.0.0.1";
}

function parseBasicAuth(req: http.IncomingMessage) {
  const header = String(req.headers.authorization || "").trim();
  if (!header.toLowerCase().startsWith("basic ")) return null;
  try {
    const raw = Buffer.from(header.slice(6), "base64").toString("utf8");
    const idx = raw.indexOf(":");
    if (idx === -1) return null;
    return { user: raw.slice(0, idx), pass: raw.slice(idx + 1) };
  } catch {
    return null;
  }
}

function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const header = String(req.headers.cookie || "");
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [kRaw, ...vParts] = part.trim().split("=");
    if (!kRaw) continue;
    const k = kRaw.trim();
    const v = vParts.join("=").trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v || "");
  }
  return out;
}

let server: http.Server | null = null;
let startedAt: string | null = null;

async function startKitchen(api: OpenClawPluginApi, cfg: KitchenConfig) {
  if (server) return;

  const host = String(cfg.host || "127.0.0.1").trim();
  const port = Number(cfg.port || 7777);
  // Default to production/stable mode unless explicitly enabled.
  // Dev mode (turbopack) can transiently 404 routes until compilation finishes.
  const dev = cfg.dev === true;
  const authToken = String(cfg.authToken ?? "");
  const qaToken = String(cfg.qaToken ?? "");
  const authMode = parseAuthMode(cfg.authMode);

  if (authMode !== "off" && !isLocalhost(host) && !authToken.trim()) {
    throw new Error(
      "Kitchen: authToken is required when binding to a non-localhost host (for Tailscale/remote access).",
    );
  }

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  const app = next({ dev, dir: rootDir });
  await app.prepare();
  const handle = app.getRequestHandler();

  // --- Team Chat WebSocket (MVP) ---
  // Path: /ws/chat?teamId=...&roomId=team|role:<role>
  //
  // Client -> server:
  //   { type: "subscribe", teamId, roomId }
  //   { type: "post", teamId, roomId, text, author?: { id?: string, label?: string } }
  // Server -> client:
  //   { type: "chat_message", message }
  //   { type: "error", error }
  const wss = new WebSocketServer({ noServer: true });

  const roomClients = new Map<string, Set<ChatSocket>>(); // key: room file path
  const roomTails = new Map<string, { watcher: fsSync.FSWatcher; size: number }>();

  type ChatSocket = WebSocket & { __roomFile?: string };

  function addClient(file: string, ws: ChatSocket) {
    let set = roomClients.get(file);
    if (!set) {
      set = new Set();
      roomClients.set(file, set);
    }
    set.add(ws);
    ws.__roomFile = file;
  }

  function removeClient(ws: ChatSocket) {
    const file = ws.__roomFile as string | undefined;
    if (!file) return;
    const set = roomClients.get(file);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        roomClients.delete(file);
        const tail = roomTails.get(file);
        if (tail) {
          try {
            tail.watcher.close();
          } catch {
            // ignore
          }
          roomTails.delete(file);
        }
      }
    }
    delete ws.__roomFile;
  }

  function broadcast(file: string, payload: unknown) {
    const set = roomClients.get(file);
    if (!set || set.size === 0) return;
    const data = JSON.stringify(payload);
    for (const ws of set) {
      try {
        if (ws.readyState === 1) ws.send(data);
      } catch {
        // ignore
      }
    }
  }

  async function ensureTail(file: string) {
    if (roomTails.has(file)) return;

    await ensureChatFile(file);
    let size = 0;
    try {
      const st = await fsSync.promises.stat(file);
      size = st.size;
    } catch {
      size = 0;
    }

    // Watch for new lines and stream them to subscribers.
    const watcher = fsSync.watch(file, { persistent: false }, async (eventType) => {
      if (eventType !== "change") return;
      try {
        const st = await fsSync.promises.stat(file);
        if (st.size <= size) {
          size = st.size;
          return;
        }
        const fd = await fsSync.promises.open(file, "r");
        try {
          const buf = Buffer.alloc(st.size - size);
          await fd.read(buf, 0, buf.length, size);
          size = st.size;
          const chunk = buf.toString("utf8");
          for (const line of chunk.split(/\r?\n/)) {
            if (!line.trim()) continue;
            try {
              const message = JSON.parse(line);
              broadcast(file, { type: "chat_message", message });
            } catch {
              // ignore malformed line
            }
          }
        } finally {
          await fd.close();
        }
      } catch {
        // ignore
      }
    });

    roomTails.set(file, { watcher, size });
  }


  server = http.createServer(async (req, res) => {
    try {
      const url = req.url || "/";

      // Health check
      if (url.startsWith("/healthz")) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, startedAt }));
        return;
      }

      const shouldProtect = authMode !== "off" && !isLocalhost(host) && authToken.trim();
      const isLocalRequest = isLoopbackRemoteAddress(req.socket.remoteAddress);

      // Some browsers fetch the PWA manifest without preserving Authorization headers,
      // causing noisy 401s in the console even though the app is working.
      // The manifest contains no secrets, so allow it unauthenticated.
      const pathname = new URL(url, `http://${host}:${port}`).pathname;
      if (pathname === "/manifest.webmanifest") {
        await handle(req, res);
        return;
      }

      if (shouldProtect && !(authMode === "local" && isLocalRequest)) {
        // Optional headless QA bypass: safe-by-default (disabled unless cfg.qaToken is set).
        // Flow:
        // - First request: /some/path?qaToken=... (must match cfg.qaToken)
        // - Server sets an HttpOnly cookie and 302-redirects to the same URL without qaToken.
        // - Subsequent requests present the cookie.
        const cookies = parseCookies(req);
        const hasQaCookie = qaToken.trim() && cookies.kitchenQaToken === qaToken;

        // Note: req.url here is path+query only, so we need a base.
        const reqUrl = new URL(url, `http://${host}:${port}`);
        const qpQaToken = String(reqUrl.searchParams.get("qaToken") || "");

        if (!hasQaCookie && qaToken.trim() && qpQaToken && qpQaToken === qaToken) {
          // Set cookie (15 minutes) and redirect to clear token from URL.
          res.statusCode = 302;
          res.setHeader(
            "set-cookie",
            `kitchenQaToken=${encodeURIComponent(qaToken)}; HttpOnly; Path=/; Max-Age=${15 * 60}; SameSite=Lax`,
          );
          reqUrl.searchParams.delete("qaToken");
          res.setHeader("location", reqUrl.pathname + (reqUrl.search ? `?${reqUrl.searchParams.toString()}` : ""));
          api.logger.warn(`[kitchen] QA token used for ${req.method || "GET"} ${reqUrl.pathname}`);
          res.end("OK");
          return;
        }

        const creds = parseBasicAuth(req);
        const ok = hasQaCookie || (creds && creds.user === "kitchen" && creds.pass === authToken);
        if (!ok) {
          res.statusCode = 401;
          res.setHeader("www-authenticate", 'Basic realm="kitchen"');
          res.end("Unauthorized");
          return;
        }
      }

      await handle(req, res);
    } catch (e: unknown) {
      api.logger.error(`[kitchen] request error: ${e instanceof Error ? e.message : String(e)}`);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server!.on("upgrade", (req, socket, head) => {
    try {
      const url = req.url || "/";
      const reqUrl = new URL(url, `http://${host}:${port}`);
      if (reqUrl.pathname !== "/ws/chat") return;

      const shouldProtect = authMode !== "off" && !isLocalhost(host) && authToken.trim();
      const isLocalRequest = isLoopbackRemoteAddress(req.socket.remoteAddress);

      if (shouldProtect && !(authMode === "local" && isLocalRequest)) {
        const cookies = parseCookies(req);
        const hasQaCookie = qaToken.trim() && cookies.kitchenQaToken === qaToken;
        const creds = parseBasicAuth(req);
        const ok = hasQaCookie || (creds && creds.user === "kitchen" && creds.pass === authToken);
        if (!ok) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", async (ws: ChatSocket, req) => {
    try {
      const url = req.url || "/";
      const reqUrl = new URL(url, `http://${host}:${port}`);
      const teamId = String(reqUrl.searchParams.get("teamId") || "").trim();
      const roomId = String(reqUrl.searchParams.get("roomId") || "").trim();
      if (!teamId || !roomId) {
        ws.send(JSON.stringify({ type: "error", error: "teamId and roomId are required" }));
        ws.close();
        return;
      }

      const teamDir = await getTeamWorkspaceDir(teamId);
      const rr = resolveRoomFile(teamDir, roomId);
      if (!rr.ok) {
        ws.send(JSON.stringify({ type: "error", error: rr.error }));
        ws.close();
        return;
      }

      await ensureTail(rr.file);
      addClient(rr.file, ws);

      ws.on("message", async (raw: Buffer) => {
        let msg: unknown;
        try {
          msg = JSON.parse(String(raw || ""));
        } catch {
          ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
          return;
        }

        if (!msg || typeof msg !== "object") return;
        const obj = msg as Record<string, unknown>;
        const type = String(obj.type || "");

        if (type === "subscribe") {
          const nextTeamId = String(obj.teamId || teamId).trim();
          const nextRoomId = String(obj.roomId || "").trim();
          if (!nextRoomId) {
            ws.send(JSON.stringify({ type: "error", error: "roomId is required" }));
            return;
          }
          const nextTeamDir = await getTeamWorkspaceDir(nextTeamId);
          const r2 = resolveRoomFile(nextTeamDir, nextRoomId);
          if (!r2.ok) {
            ws.send(JSON.stringify({ type: "error", error: r2.error }));
            return;
          }
          await ensureTail(r2.file);
          removeClient(ws);
          addClient(r2.file, ws);
          return;
        }

        if (type === "post") {
          const postTeamId = String(obj.teamId || teamId).trim();
          const postRoomId = String(obj.roomId || roomId).trim();
          const text = String(obj.text || "");
          if (!text.trim()) {
            ws.send(JSON.stringify({ type: "error", error: "text is required" }));
            return;
          }
          const author = obj.author && typeof obj.author === "object" ? (obj.author as Record<string, unknown>) : {};

          const postTeamDir = await getTeamWorkspaceDir(postTeamId);
          const r = await appendChatMessage({
            teamDir: postTeamDir,
            roomId: postRoomId,
            text,
            author: {
              kind: "human",
              id: String(author.id || "kitchen"),
              label: author.label ? String(author.label) : undefined,
            },
          });

          if (!r.ok) {
            ws.send(JSON.stringify({ type: "error", error: r.error }));
            return;
          }

          // The file watcher will fan this out to every subscriber, including the sender.
          // Avoid an immediate second broadcast here, or websocket posts will appear twice.
        }
      });

      ws.on("close", () => removeClient(ws));
      ws.on("error", () => removeClient(ws));
    } catch (e: unknown) {
      try {
        const msg = e instanceof Error ? e.message : String(e);
        ws.send(JSON.stringify({ type: "error", error: msg || "connection error" }));
      } catch {}
      try {
        ws.close();
      } catch {}
    }
  });

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(port, host, () => resolve());
  });

  startedAt = new Date().toISOString();
  api.logger.info(`[kitchen] listening on http://${host}:${port} (dev=${dev})`);
}

async function stopKitchen(api: OpenClawPluginApi) {
  if (!server) return;
  const s = server;
  server = null;
  startedAt = null;
  await new Promise<void>((resolve) => s.close(() => resolve()));
  api.logger.info("[kitchen] stopped");
}


const kitchenPlugin = {
  id: "kitchen",
  name: "ClawKitchen",
  description: "Local UI for managing recipes, teams, agents, cron jobs, and skills.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean", default: true },
      dev: {
        type: "boolean",
        default: false,
        description: "Run Next.js in dev mode (not recommended for end users).",
      },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "integer", default: 7777, minimum: 1, maximum: 65535 },
      authMode: {
        type: "string",
        enum: ["on", "local", "off"],
        default: "on",
        description: "Auth protection mode (on|local|off).",
      },
      authToken: {
        type: "string",
        default: "",
        description: "Required when host is not localhost. Used for HTTP Basic auth (username: kitchen).",
      },
      qaToken: {
        type: "string",
        default: "",
        description:
          "Optional QA-only bypass token. If set, visiting any URL with ?qaToken=<token> sets a short-lived cookie for headless/automated access.",
      },
    },
  },
  register(api: OpenClawPluginApi) {
    // Expose the plugin API to the Next.js server runtime (runs in-process with the gateway).
    // This lets API routes call into OpenClaw runtime helpers without using child_process or env.
    (globalThis as unknown as { __clawkitchen_api?: OpenClawPluginApi }).__clawkitchen_api = api;

    const cfg = (api.pluginConfig || {}) as KitchenConfig;

    api.registerCli(
      ({ program }) => {
        const cmd = program.command("kitchen").description("ClawKitchen UI");

        cmd
          .command("status")
          .description("Print Kitchen status")
          .action(async () => {
            const host = String(cfg.host || "127.0.0.1").trim();
            const port = Number(cfg.port || 7777);
            const url = `http://${host}:${port}`;

            const result: {
              ok: boolean;
              running: boolean;
              url: string;
              startedAt: string | null;
              error?: string;
            } = { ok: true, running: false, url, startedAt: null };

            try {
              result.running = Boolean(server);
              result.startedAt = startedAt;
            } catch (e: unknown) {
              result.running = false;
              result.startedAt = null;
              result.error = e instanceof Error ? e.message : String(e);
            }

            console.log(JSON.stringify(result, null, 2));
          });

        cmd
          .command("open")
          .description("Print the Kitchen URL")
          .action(() => {
            const host = String(cfg.host || "127.0.0.1").trim();
            const port = Number(cfg.port || 7777);
            console.log(`http://${host}:${port}`);
          });
      },
      { commands: ["kitchen"] },
    );

    api.registerService({
      id: "kitchen",
      start: async () => {
        if (cfg.enabled === false) return;
        try {
          await startKitchen(api, cfg);
        } catch (e: unknown) {
          api.logger.error(`[kitchen] failed to start: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      stop: async () => {
        try {
          await stopKitchen(api);
        } catch (e: unknown) {
          api.logger.error(`[kitchen] failed to stop: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    });
  },
};

export default kitchenPlugin;
