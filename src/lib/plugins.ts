import { cachedRunOpenClaw } from "@/lib/openclaw-cache";

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

export async function isPluginEnabled(pluginId: string): Promise<boolean> {
  const res = await getEnabledPluginIds();
  if (!res.ok) return false;
  return res.ids.includes(pluginId);
}
