import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";

import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// Next is already a dependency of ClawKitchen.
import next from "next";

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

  // Ensure better-sqlite3 native binary is compiled for this platform.
  // openclaw installs plugins with --ignore-scripts, so node-gyp never runs.
  const sqliteBindingPath = path.join(rootDir, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  if (!fs.existsSync(sqliteBindingPath)) {
    api.logger.info("[kitchen] better-sqlite3 native binary missing — rebuilding for this platform...");
    const res = await api.runtime.system.runCommandWithTimeout(
      ["npm", "rebuild", "better-sqlite3"],
      { timeoutMs: 120_000, cwd: rootDir },
    );
    if (res.code !== 0) {
      api.logger.error(`[kitchen] failed to rebuild better-sqlite3: ${res.stderr || res.stdout}`);
    } else {
      api.logger.info("[kitchen] better-sqlite3 rebuilt successfully.");
    }
  }

  const app = next({ dev, dir: rootDir });
  await app.prepare();
  const handle = app.getRequestHandler();

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

        // --- Plugin helpers (used by status + plugins subcommands) ---
        const pluginsDir = path.join(homedir(), '.openclaw', 'kitchen', 'plugins');

        function listInstalledPlugins(): { id: string; name: string; version: string; teamTypes: string[] }[] {
          const nmDir = path.join(pluginsDir, 'node_modules');
          if (!fs.existsSync(nmDir)) return [];
          const found: { id: string; name: string; version: string; teamTypes: string[] }[] = [];
          const entries = fs.readdirSync(nmDir);
          for (const entry of entries) {
            const dirs = entry.startsWith('@')
              ? fs.readdirSync(path.join(nmDir, entry)).map(s => path.join(nmDir, entry, s))
              : [path.join(nmDir, entry)];
            for (const d of dirs) {
              try {
                const raw = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
                if (raw.kitchenPlugin?.id) {
                  found.push({
                    id: raw.kitchenPlugin.id,
                    name: raw.kitchenPlugin.name || raw.name,
                    version: raw.version || '0.0.0',
                    teamTypes: raw.kitchenPlugin.teamTypes || [],
                  });
                }
              } catch { /* skip non-plugin packages */ }
            }
          }
          return found;
        }

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
              plugins?: { id: string; name: string; version: string }[];
              error?: string;
            } = { ok: true, running: false, url, startedAt: null };

            // Probe the live server's /healthz endpoint
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 3000);
              const resp = await fetch(`http://127.0.0.1:${port}/healthz`, {
                signal: controller.signal,
              });
              clearTimeout(timer);
              if (resp.ok) {
                const data = await resp.json();
                result.running = true;
                result.startedAt = data.startedAt || null;
              }
            } catch {
              result.running = false;
            }

            // Also list installed plugins
            result.plugins = listInstalledPlugins();

            console.log(JSON.stringify(result, null, 2));
          });

        cmd
          .command("restart")
          .description("Restart Kitchen (clears plugin cache)")
          .action(async () => {
            const port = Number(cfg.port || 7777);

            // If running in-process (same gateway), use direct stop/start
            if (server) {
              console.log("Restarting Kitchen (in-process)...");
              await stopKitchen(api);
              await startKitchen(api, cfg);
              console.log("✅ Kitchen restarted.");
              return;
            }

            // Otherwise, running as CLI — tell the user to restart the gateway
            // First check if it's actually running
            let running = false;
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 3000);
              const resp = await fetch(`http://127.0.0.1:${port}/healthz`, {
                signal: controller.signal,
              });
              clearTimeout(timer);
              running = resp.ok;
            } catch { /* not running */ }

            if (!running) {
              console.log("Kitchen is not running. Start the gateway to launch Kitchen.");
              return;
            }

            console.log("Kitchen is running inside the gateway process.");
            console.log("To restart, run: openclaw gateway restart");
          });

        cmd
          .command("open")
          .description("Print the Kitchen URL")
          .action(() => {
            const host = String(cfg.host || "127.0.0.1").trim();
            const port = Number(cfg.port || 7777);
            console.log(`http://${host}:${port}`);
          });

        // --- Kitchen plugin management CLI ---
        const pluginsCmd = cmd
          .command("plugins")
          .description("Manage Kitchen plugins");

        pluginsCmd
          .command("list")
          .description("List installed Kitchen plugins")
          .action(() => {
            const found = listInstalledPlugins();
            if (!found.length) {
              console.log('No Kitchen plugins installed.');
              return;
            }
            console.log(JSON.stringify(found, null, 2));
          });

        pluginsCmd
          .command("install <package>")
          .description("Install a Kitchen plugin from npm (e.g. @jiggai/kitchen-plugin-marketing)")
          .action(async (pkg: string) => {
            fs.mkdirSync(pluginsDir, { recursive: true });
            // Ensure a package.json exists so npm install --save works
            const pjPath = path.join(pluginsDir, 'package.json');
            if (!fs.existsSync(pjPath)) {
              fs.writeFileSync(pjPath, JSON.stringify({ name: 'kitchen-plugins', version: '1.0.0', private: true, dependencies: {} }, null, 2));
            }
            console.log(`Installing ${pkg}...`);
            try {
              const res = await api.runtime.system.runCommandWithTimeout(
                ['npm', 'install', '--save', pkg],
                { timeoutMs: 120_000, cwd: pluginsDir },
              );
              if (res.code !== 0) throw new Error(res.stderr || res.stdout || 'npm install failed');
              if (res.stdout) console.log(res.stdout);
              console.log(`\n✅ Plugin ${pkg} installed. Restart the gateway to activate.`);
            } catch (e) {
              console.error(`\n❌ Failed to install ${pkg}. Check the package name and try again.`);
              if (e instanceof Error && e.message) console.error(e.message);
              process.exit(1);
            }
          });

        pluginsCmd
          .command("remove <package>")
          .description("Remove a Kitchen plugin")
          .action(async (pkg: string) => {
            const pjPath = path.join(pluginsDir, 'package.json');
            if (!fs.existsSync(pjPath)) {
              console.error('No plugins installed.');
              process.exit(1);
            }
            console.log(`Removing ${pkg}...`);
            try {
              const res = await api.runtime.system.runCommandWithTimeout(
                ['npm', 'uninstall', pkg],
                { timeoutMs: 60_000, cwd: pluginsDir },
              );
              if (res.code !== 0) throw new Error(res.stderr || res.stdout || 'npm uninstall failed');
              if (res.stdout) console.log(res.stdout);
              console.log(`\n✅ Plugin ${pkg} removed. Restart the gateway to apply.`);
            } catch (e) {
              console.error(`\n❌ Failed to remove ${pkg}.`);
              if (e instanceof Error && e.message) console.error(e.message);
              process.exit(1);
            }
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
