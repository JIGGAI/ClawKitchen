import { cachedRunOpenClaw } from "@/lib/openclaw-cache";
import { readOpenClawConfig } from "@/lib/paths";

export type PluginListEntry = {
  id?: unknown;
  enabled?: unknown;
};

function extractPluginEntries(raw: unknown): PluginListEntry[] {
  if (Array.isArray(raw)) return raw as PluginListEntry[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { plugins?: unknown }).plugins)) {
    return (raw as { plugins: PluginListEntry[] }).plugins;
  }
  return [];
}

export function parseEnabledPluginIds(stdout: string): string[] {
  const parsed = JSON.parse(stdout) as unknown;
  const items = extractPluginEntries(parsed);
  return items
    .filter((p) => Boolean(p) && typeof p === "object" && (p as { enabled?: unknown }).enabled === true)
    .map((p) => String(p.id ?? ""))
    .filter(Boolean);
}

export async function getEnabledPluginIds(): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  // `openclaw plugins list` takes ~15s on this machine. Cache for 30s — workflow
  // editor pages render this on every poll. Plugin enable/disable changes are
  // rare and 30s lag to pick them up is acceptable.
  const res = await cachedRunOpenClaw(["plugins", "list", "--json", "--verbose"]);
  if (!res.ok) {
    const err = res.stderr.trim() || `openclaw plugins list failed (exit=${res.exitCode})`;
    return { ok: false, error: err };
  }

  try {
    return { ok: true, ids: parseEnabledPluginIds(res.stdout) };
  } catch {
    return { ok: false, error: "Failed to parse openclaw plugins list output" };
  }
}

/**
 * Resolve plugin enabled-ness from ~/.openclaw/openclaw.json (~1ms file read)
 * if the plugin is explicitly listed under plugins.entries. Returns null when
 * the plugin isn't configured there — the caller should fall back to the
 * subprocess (which sees auto-enabled built-in plugins like LLM providers).
 */
async function explicitPluginEnabledFromConfig(pluginId: string): Promise<boolean | null> {
  try {
    const cfg = (await readOpenClawConfig()) as { plugins?: { entries?: Record<string, { enabled?: unknown }> } };
    const entries = cfg.plugins?.entries;
    if (entries && typeof entries === "object" && Object.prototype.hasOwnProperty.call(entries, pluginId)) {
      return entries[pluginId]?.enabled === true;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check whether a plugin is enabled.
 *
 * Fast path: read ~/.openclaw/openclaw.json directly (~1ms). The kitchen
 * workflow editor calls this on every render to gate `llm-task` features and
 * `llm-task` is always explicitly configured under plugins.entries — so the
 * direct-config path always answers it without spawning a subprocess.
 *
 * Fallback: if the plugin id isn't in plugins.entries (e.g. an auto-enabled
 * built-in LLM provider like `anthropic`), defer to the cached subprocess
 * result. That keeps correctness for callers that ask about plugins not
 * surfaced in the local config file.
 */
export async function isPluginEnabled(pluginId: string): Promise<boolean> {
  const explicit = await explicitPluginEnabledFromConfig(pluginId);
  if (explicit !== null) return explicit;
  const res = await getEnabledPluginIds();
  if (!res.ok) return false;
  return res.ids.includes(pluginId);
}
