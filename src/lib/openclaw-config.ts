import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type OpenClawConfigFile = {
  gateway?: unknown;
  channels?: unknown;
  bindings?: unknown;
  // allow extra keys
  [k: string]: unknown;
};

function configPath() {
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

export async function readOpenClawConfigRaw(): Promise<{ path: string; raw: string; hash: string; json: OpenClawConfigFile }> {
  const p = configPath();
  const raw = await fs.readFile(p, "utf8");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const json = JSON.parse(raw) as OpenClawConfigFile;
  return { path: p, raw, hash, json };
}

export function redactChannels(channels: unknown) {
  if (!channels || typeof channels !== "object") return {};
  const root = channels as Record<string, unknown>;

  function redactObj(v: unknown): unknown {
    if (!v || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(redactObj);

    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) {
      if (k === "botToken" || k === "token" || k === "authToken" || k.toLowerCase().includes("secret")) {
        if (typeof val === "string" && val) out[k] = "__OPENCLAW_REDACTED__";
        else out[k] = val;
        continue;
      }
      out[k] = redactObj(val);
    }
    return out;
  }

  return redactObj(root);
}

export async function patchOpenClawConfigFile({
  patch,
  note,
}: {
  patch: (prev: OpenClawConfigFile) => OpenClawConfigFile;
  note?: string;
}): Promise<{ ok: true; path: string; hash: string }> {
  const p = configPath();
  const prevRaw = await fs.readFile(p, "utf8");
  const prev = JSON.parse(prevRaw) as OpenClawConfigFile;

  const next = patch(prev);
  const nextRaw = JSON.stringify(next, null, 2) + "\n";

  // Atomic-ish write: write temp then rename.
  const dir = path.dirname(p);
  const tmp = path.join(dir, `openclaw.json.tmp.${process.pid}.${Date.now()}`);
  await fs.writeFile(tmp, nextRaw, "utf8");
  await fs.rename(tmp, p);

  // Best-effort breadcrumb.
  if (note) {
    try {
      const notesDir = path.join(dir, "notes");
      await fs.mkdir(notesDir, { recursive: true });
      await fs.appendFile(path.join(notesDir, "kitchen-config.log"), `[${new Date().toISOString()}] ${note}\n`, "utf8");
    } catch {
      // ignore
    }
  }

  const hash = crypto.createHash("sha256").update(nextRaw).digest("hex");
  return { ok: true, path: p, hash };
}
