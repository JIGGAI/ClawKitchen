import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

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
let standaloneChild: ChildProcess | null = null;
let standalonePort: number | null = null;
let startedAt: string | null = null;

function getRootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function getStandaloneDir(rootDir: string) {
  return path.join(rootDir, ".next", "standalone");
}

function getStandaloneServerPath(rootDir: string) {
  return path.join(getStandaloneDir(rootDir), "server.js");
}

async function waitForStandaloneReady(port: number, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) return;
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Kitchen standalone server did not become ready on port ${port}`);
}

async function startStandaloneServer(api: OpenClawPluginApi, rootDir: string, host: string, port: number) {
  const serverPath = getStandaloneServerPath(rootDir);
  const child = spawn(process.execPath, [serverPath], {
    cwd: getStandaloneDir(rootDir),
    env: {
      ...process.env,
      HOSTNAME: host,
      PORT: String(port),
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (buf) => api.logger.info(`[kitchen:standalone] ${String(buf).trimEnd()}`));
  child.stderr?.on("data", (buf) => api.logger.warn(`[kitchen:standalone] ${String(buf).trimEnd()}`));
  child.on("exit", (code, signal) => {
    api.logger.warn(`[kitchen:standalone] exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    if (standaloneChild === child) {
      standaloneChild = null;
      standalonePort = null;
    }
  });

  standaloneChild = child;
  standalonePort = port;
  await waitForStandaloneReady(port);
}

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

  const rootDir = getRootDir();

  if (!dev) {
    // Production path: launch the self-contained Next standalone server.
    // This avoids requiring host-installed `next` on user systems.
    const internalPort = port + 1000;
    await startStandaloneServer(api, rootDir, "127.0.0.1", internalPort);
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

      if (dev) {
        // Dev mode still uses Next directly from the repo workspace.
        const nextMod = await import("next");
        const app = nextMod.default({ dev: true, dir: rootDir });
        await app.prepare();
        const handle = app.getRequestHandler();
        await handle(req, res);
        return;
      }

      if (!standalonePort) {
        throw new Error("Kitchen standalone server is not running");
      }

      const upstream = new URL(url, `http://127.0.0.1:${standalonePort}`);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(", "));
      }
      headers.set("host", `127.0.0.1:${standalonePort}`);

      const method = (req.method || "GET").toUpperCase();
      const requestBody = method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(req) as ReadableStream;
      const requestInit: RequestInit & { duplex?: "half" } = {
        method,
        headers,
        redirect: "manual",
      };
      if (requestBody) {
        requestInit.body = requestBody;
        requestInit.duplex = "half";
      }
      const upstreamRes = await fetch(upstream, requestInit);

      res.statusCode = upstreamRes.status;
      upstreamRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === "transfer-encoding") return;
        res.setHeader(key, value);
      });
      if (upstreamRes.body) {
        const reader = upstreamRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      }
      res.end();
    } catch (e: unknown) {
      api.logger.error(`[kitchen] request error: ${e instanceof Error ? e.message : String(e)}`);
      res.statusCode = 500;
      res.end("Internal Server Error");
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
  if (server) {
    const s = server;
    server = null;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  if (standaloneChild) {
    const child = standaloneChild;
    standaloneChild = null;
    standalonePort = null;
    child.kill("SIGTERM");
  }
  startedAt = null;
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
