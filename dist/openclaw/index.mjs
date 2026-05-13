// openclaw/index.ts
import http from "node:http";
import path2 from "node:path";
import fs2 from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import next from "next";

// openclaw/list-installed-plugins.ts
import fs from "node:fs";
import path from "node:path";
function listInstalledPlugins(pluginsDir) {
  const nmDir = path.join(pluginsDir, "node_modules");
  if (!fs.existsSync(nmDir)) return [];
  const found = [];
  const entries = fs.readdirSync(nmDir);
  for (const entry of entries) {
    const dirs = entry.startsWith("@") ? fs.readdirSync(path.join(nmDir, entry)).map((s) => path.join(nmDir, entry, s)) : [path.join(nmDir, entry)];
    for (const d of dirs) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf8"));
        if (raw.kitchenPlugin?.id) {
          found.push({
            id: raw.kitchenPlugin.id,
            name: raw.kitchenPlugin.name || raw.name || "",
            version: raw.version || "0.0.0",
            teamTypes: raw.kitchenPlugin.teamTypes || []
          });
        }
      } catch {
      }
    }
  }
  return found;
}

// openclaw/index.ts
function parseAuthMode(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "off") return "off";
  if (s === "local") return "local";
  return "on";
}
function isLocalhost(host) {
  const h = (host || "").trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}
function isLoopbackRemoteAddress(addr) {
  const a = String(addr || "").trim().toLowerCase();
  if (!a) return false;
  if (a === "::1") return true;
  if (a.startsWith("::ffff:")) {
    const v4 = a.slice("::ffff:".length);
    return v4 === "127.0.0.1";
  }
  return a === "127.0.0.1";
}
function parseBasicAuth(req) {
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
function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  const out = {};
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
var server = null;
var startedAt = null;
function resolveKitchenRoot() {
  const moduleDir = path2.dirname(fileURLToPath(import.meta.url));
  const candidates = [moduleDir, path2.resolve(moduleDir, ".."), path2.resolve(moduleDir, "../..")];
  for (const candidate of candidates) {
    const packageJsonPath = path2.join(candidate, "package.json");
    if (!fs2.existsSync(packageJsonPath)) continue;
    try {
      const pkg = JSON.parse(fs2.readFileSync(packageJsonPath, "utf8"));
      if (pkg?.name === "@jiggai/kitchen") return candidate;
    } catch {
    }
  }
  return path2.resolve(moduleDir, "..");
}
async function startKitchen(api, cfg) {
  if (server) return;
  const host = String(cfg.host || "127.0.0.1").trim();
  const port = Number(cfg.port || 7777);
  const dev = cfg.dev === true;
  const authToken = String(cfg.authToken ?? "");
  const qaToken = String(cfg.qaToken ?? "");
  const authMode = parseAuthMode(cfg.authMode);
  if (authMode !== "off" && !isLocalhost(host) && !authToken.trim()) {
    throw new Error(
      "Kitchen: authToken is required when binding to a non-localhost host (for Tailscale/remote access)."
    );
  }
  const rootDir = resolveKitchenRoot();
  const sqliteBindingPath = path2.join(rootDir, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  if (!fs2.existsSync(sqliteBindingPath)) {
    api.logger.info("[kitchen] better-sqlite3 native binary missing \u2014 rebuilding for this platform...");
    const res = await api.runtime.system.runCommandWithTimeout(
      ["npm", "rebuild", "better-sqlite3"],
      { timeoutMs: 12e4, cwd: rootDir }
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
      if (url.startsWith("/healthz")) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, startedAt }));
        return;
      }
      const shouldProtect = authMode !== "off" && !isLocalhost(host) && authToken.trim();
      const isLocalRequest = isLoopbackRemoteAddress(req.socket.remoteAddress);
      const pathname = new URL(url, `http://${host}:${port}`).pathname;
      if (pathname === "/manifest.webmanifest") {
        await handle(req, res);
        return;
      }
      if (shouldProtect && !(authMode === "local" && isLocalRequest)) {
        const cookies = parseCookies(req);
        const hasQaCookie = qaToken.trim() && cookies.kitchenQaToken === qaToken;
        const reqUrl = new URL(url, `http://${host}:${port}`);
        const qpQaToken = String(reqUrl.searchParams.get("qaToken") || "");
        if (!hasQaCookie && qaToken.trim() && qpQaToken && qpQaToken === qaToken) {
          res.statusCode = 302;
          res.setHeader(
            "set-cookie",
            `kitchenQaToken=${encodeURIComponent(qaToken)}; HttpOnly; Path=/; Max-Age=${15 * 60}; SameSite=Lax`
          );
          reqUrl.searchParams.delete("qaToken");
          res.setHeader("location", reqUrl.pathname + (reqUrl.search ? `?${reqUrl.searchParams.toString()}` : ""));
          api.logger.warn(`[kitchen] QA token used for ${req.method || "GET"} ${reqUrl.pathname}`);
          res.end("OK");
          return;
        }
        const creds = parseBasicAuth(req);
        const ok = hasQaCookie || creds && creds.user === "kitchen" && creds.pass === authToken;
        if (!ok) {
          res.statusCode = 401;
          res.setHeader("www-authenticate", 'Basic realm="kitchen"');
          res.end("Unauthorized");
          return;
        }
      }
      await handle(req, res);
    } catch (e) {
      api.logger.error(`[kitchen] request error: ${e instanceof Error ? e.message : String(e)}`);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  startedAt = (/* @__PURE__ */ new Date()).toISOString();
  api.logger.info(`[kitchen] listening on http://${host}:${port} (dev=${dev})`);
}
async function stopKitchen(api) {
  if (!server) return;
  const s = server;
  server = null;
  startedAt = null;
  await new Promise((resolve) => s.close(() => resolve()));
  api.logger.info("[kitchen] stopped");
}
var kitchenPlugin = {
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
        description: "Run Next.js in dev mode (not recommended for end users)."
      },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "integer", default: 7777, minimum: 1, maximum: 65535 },
      authMode: {
        type: "string",
        enum: ["on", "local", "off"],
        default: "on",
        description: "Auth protection mode (on|local|off)."
      },
      authToken: {
        type: "string",
        default: "",
        description: "Required when host is not localhost. Used for HTTP Basic auth (username: kitchen)."
      },
      qaToken: {
        type: "string",
        default: "",
        description: "Optional QA-only bypass token. If set, visiting any URL with ?qaToken=<token> sets a short-lived cookie for headless/automated access."
      }
    }
  },
  register(api) {
    globalThis.__clawkitchen_api = api;
    const cfg = api.pluginConfig || {};
    api.registerCli(
      ({ program }) => {
        const cmd = program.command("kitchen").description("ClawKitchen UI");
        const pluginsDir = path2.join(homedir(), ".openclaw", "kitchen", "plugins");
        cmd.command("status").description("Print Kitchen status").action(async () => {
          const host = String(cfg.host || "127.0.0.1").trim();
          const port = Number(cfg.port || 7777);
          const url = `http://${host}:${port}`;
          const result = { ok: true, running: false, url, startedAt: null };
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3e3);
            const resp = await fetch(`http://127.0.0.1:${port}/healthz`, {
              signal: controller.signal
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
          result.plugins = listInstalledPlugins(pluginsDir);
          console.log(JSON.stringify(result, null, 2));
        });
        cmd.command("restart").description("Restart Kitchen (clears plugin cache)").action(async () => {
          const port = Number(cfg.port || 7777);
          if (server) {
            console.log("Restarting Kitchen (in-process)...");
            await stopKitchen(api);
            await startKitchen(api, cfg);
            console.log("\u2705 Kitchen restarted.");
            return;
          }
          let running = false;
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3e3);
            const resp = await fetch(`http://127.0.0.1:${port}/healthz`, {
              signal: controller.signal
            });
            clearTimeout(timer);
            running = resp.ok;
          } catch {
          }
          if (!running) {
            console.log("Kitchen is not running. Start the gateway to launch Kitchen.");
            return;
          }
          console.log("Kitchen is running inside the gateway process.");
          console.log("To restart, run: openclaw gateway restart");
        });
        cmd.command("open").description("Print the Kitchen URL").action(() => {
          const host = String(cfg.host || "127.0.0.1").trim();
          const port = Number(cfg.port || 7777);
          console.log(`http://${host}:${port}`);
        });
        const pluginsCmd = cmd.command("plugins").description("Manage Kitchen plugins");
        pluginsCmd.command("list").description("List installed Kitchen plugins").action(() => {
          const found = listInstalledPlugins(pluginsDir);
          if (!found.length) {
            console.log("No Kitchen plugins installed.");
            return;
          }
          console.log(JSON.stringify(found, null, 2));
        });
        pluginsCmd.command("install <package>").description("Install a Kitchen plugin from npm (e.g. @jiggai/kitchen-plugin-marketing)").action(async (pkg) => {
          fs2.mkdirSync(pluginsDir, { recursive: true });
          const pjPath = path2.join(pluginsDir, "package.json");
          if (!fs2.existsSync(pjPath)) {
            fs2.writeFileSync(pjPath, JSON.stringify({ name: "kitchen-plugins", version: "1.0.0", private: true, dependencies: {} }, null, 2));
          }
          console.log(`Installing ${pkg}...`);
          try {
            const res = await api.runtime.system.runCommandWithTimeout(
              ["npm", "install", "--save", pkg],
              { timeoutMs: 12e4, cwd: pluginsDir }
            );
            if (res.code !== 0) throw new Error(res.stderr || res.stdout || "npm install failed");
            if (res.stdout) console.log(res.stdout);
            console.log(`
\u2705 Plugin ${pkg} installed. Restart the gateway to activate.`);
          } catch (e) {
            console.error(`
\u274C Failed to install ${pkg}. Check the package name and try again.`);
            if (e instanceof Error && e.message) console.error(e.message);
            process.exit(1);
          }
        });
        pluginsCmd.command("remove <package>").description("Remove a Kitchen plugin").action(async (pkg) => {
          const pjPath = path2.join(pluginsDir, "package.json");
          if (!fs2.existsSync(pjPath)) {
            console.error("No plugins installed.");
            process.exit(1);
          }
          console.log(`Removing ${pkg}...`);
          try {
            const res = await api.runtime.system.runCommandWithTimeout(
              ["npm", "uninstall", pkg],
              { timeoutMs: 6e4, cwd: pluginsDir }
            );
            if (res.code !== 0) throw new Error(res.stderr || res.stdout || "npm uninstall failed");
            if (res.stdout) console.log(res.stdout);
            console.log(`
\u2705 Plugin ${pkg} removed. Restart the gateway to apply.`);
          } catch (e) {
            console.error(`
\u274C Failed to remove ${pkg}.`);
            if (e instanceof Error && e.message) console.error(e.message);
            process.exit(1);
          }
        });
      },
      { commands: ["kitchen"] }
    );
    api.on("gateway_start", async () => {
      if (cfg.enabled === false) return;
      try {
        await startKitchen(api, cfg);
      } catch (e) {
        api.logger.error(`[kitchen] failed to start: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    api.on("gateway_stop", async () => {
      try {
        await stopKitchen(api);
      } catch (e) {
        api.logger.error(`[kitchen] failed to stop: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }
};
var index_default = kitchenPlugin;
export {
  index_default as default
};
