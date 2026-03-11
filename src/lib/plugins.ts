import { runOpenClaw } from "@/lib/openclaw";

export type PluginListEntry = {
  id?: unknown;
  enabled?: unknown;
};

export async function getEnabledPluginIds(): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const res = await runOpenClaw(["plugins", "list", "--json", "--verbose"]);
  if (!res.ok) {
    const err = res.stderr.trim() || `openclaw plugins list failed (exit=${res.exitCode})`;
    return { ok: false, error: err };
  }

  try {
    const items = JSON.parse(res.stdout) as PluginListEntry[];
    const ids = Array.isArray(items)
      ? items
          .filter((p) => Boolean(p) && typeof p === "object" && (p as { enabled?: unknown }).enabled === true)
          .map((p) => String(p.id ?? ""))
          .filter(Boolean)
      : [];
    return { ok: true, ids };
  } catch {
    return { ok: false, error: "Failed to parse openclaw plugins list output" };
  }
}

export async function isPluginEnabled(pluginId: string): Promise<boolean> {
  const res = await getEnabledPluginIds();
  if (!res.ok) return false;
  return res.ids.includes(pluginId);
}
