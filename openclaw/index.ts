import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Next is already a dependency of ClawKitchen.
import next from "next";

type KitchenConfig = {
  enabled?: boolean;
  dev?: boolean;
  host?: string;
  port?: number;
  authToken?: string;
};

function isLocalhost(host: string) {
  const h = (host || "").trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
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

let server: http.Server | null = null;
let startedAt: string | null = null;

async function startKitchen(api: OpenClawPluginApi, cfg: KitchenConfig) {
  if (server) return;

  const host = String(cfg.host || "127.0.0.1").trim();
  const port = Number(cfg.port || 7777);
  const dev = cfg.dev !== false;
  const authToken = String(cfg.authToken || "");

  if (!isLocalhost(host) && !authToken.trim()) {
    throw new Error("Kitchen: authToken is required when binding to a non-localhost host (for Tailscale/remote access).");
  }

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

      if (!isLocalhost(host) && authToken.trim()) {
        const creds = parseBasicAuth(req);
        const ok = creds && creds.user === "kitchen" && creds.pass === authToken;
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
  configSchema: { type: "object", additionalProperties: true, properties: {} },
  register(api: OpenClawPluginApi) {
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

            // Do a real health check so status works even when the service is running
            // in a different process/context than this CLI handler.
            const healthUrl = `${url}/healthz`;

            const result: {
              ok: boolean;
              running: boolean;
              url: string;
              startedAt: string | null;
              error?: string;
            } = { ok: true, running: false, url, startedAt: null };

            try {
              const json = await new Promise<{ ok?: boolean; startedAt?: unknown }>((resolve, reject) => {
                const req = http.get(healthUrl, (res) => {
                  const status = res.statusCode || 0;
                  let buf = "";
                  res.setEncoding("utf8");
                  res.on("data", (d) => (buf += d));
                  res.on("end", () => {
                    if (status < 200 || status >= 300) {
                      reject(new Error(`healthz returned HTTP ${status}`));
                      return;
                    }
                    try {
                      resolve(JSON.parse(buf));
                    } catch (e) {
                      reject(e);
                    }
                  });
                });
                req.on("error", reject);
              });

              result.running = Boolean(json.ok);
              result.startedAt = typeof json.startedAt === "string" ? json.startedAt : null;
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
