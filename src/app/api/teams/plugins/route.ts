import { NextResponse } from "next/server";
import { discoverKitchenPlugins } from "@/lib/kitchen-plugins";
import { getTeamContextFromBody, withTeamContextFromQuery } from "@/lib/api-route-helpers";
import { getEnabledPlugins, setPluginEnabled } from "@/lib/team-plugins";

export async function GET(req: Request) {
  return withTeamContextFromQuery(req, async ({ teamDir }) => {
    const enabled = await getEnabledPlugins(teamDir);
    const plugins = Array.from(discoverKitchenPlugins().values()).map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      teamTypes: plugin.teamTypes,
      enabled: enabled.includes(plugin.id),
      tabs: plugin.tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon })),
    }));

    return NextResponse.json({ ok: true, plugins });
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { teamId?: string; pluginId?: string; enabled?: boolean };
  const ctx = await getTeamContextFromBody(body);
  if (ctx instanceof NextResponse) return ctx;

  const pluginId = String(body.pluginId ?? "").trim();
  if (!pluginId) {
    return NextResponse.json({ ok: false, error: "pluginId is required" }, { status: 400 });
  }

  const plugin = discoverKitchenPlugins().get(pluginId);
  if (!plugin) {
    return NextResponse.json({ ok: false, error: "Plugin not found" }, { status: 404 });
  }

  const enabled = body.enabled === true;
  const enabledPlugins = await setPluginEnabled(ctx.teamDir, pluginId, enabled);
  return NextResponse.json({ ok: true, pluginId, enabled, enabledPlugins });
}
