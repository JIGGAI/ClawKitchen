import { NextRequest, NextResponse } from "next/server";
import { discoverKitchenPlugins, getPluginsForTeamType } from "@/lib/kitchen-plugins";
import { resolveTeamDir, getEnabledPlugins } from "@/lib/team-plugins";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamType = searchParams.get('teamType');

    const teamId = searchParams.get('teamId');

    let plugins;
    if (teamId) {
      const teamDir = await resolveTeamDir(teamId);
      const enabled = await getEnabledPlugins(teamDir);
      plugins = Array.from(discoverKitchenPlugins().values()).filter((plugin) => enabled.includes(plugin.id));
    } else if (teamType) {
      plugins = getPluginsForTeamType(teamType);
    } else {
      plugins = Array.from(discoverKitchenPlugins().values());
    }

    return NextResponse.json({
      success: true,
      plugins: plugins.map(plugin => ({
        id: plugin.id,
        name: plugin.name,
        teamTypes: plugin.teamTypes,
        tabs: plugin.tabs.map(tab => ({
          id: tab.id,
          label: tab.label,
          icon: tab.icon,
        })),
      })),
    });
  } catch (error) {
    console.error('Error discovering kitchen plugins:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to discover plugins' },
      { status: 500 }
    );
  }
}