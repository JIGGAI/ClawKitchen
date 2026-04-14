import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { discoverKitchenPlugins } from "@/lib/kitchen-plugins";
import { isPluginEnabledForTeam } from "@/lib/team-plugins";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string; tabId: string }> }
) {
  try {
    const { pluginId, tabId } = await params;
    const teamId = request.nextUrl.searchParams.get('teamId');
    const plugins = discoverKitchenPlugins();
    const plugin = plugins.get(pluginId);

    if (!plugin) {
      return NextResponse.json(
        { error: 'Plugin not found' },
        { status: 404 }
      );
    }

    if (teamId && !(await isPluginEnabledForTeam(teamId, pluginId))) {
      return NextResponse.json(
        { error: 'Plugin is not enabled for this team' },
        { status: 403 }
      );
    }

    const tab = plugin.tabs.find(t => t.id === tabId);
    if (!tab) {
      return NextResponse.json(
        { error: 'Tab not found' },
        { status: 404 }
      );
    }

    if (!existsSync(tab.bundle)) {
      return NextResponse.json(
        { error: 'Tab bundle not found' },
        { status: 404 }
      );
    }

    const bundleContent = readFileSync(tab.bundle, 'utf8');

    // Return JavaScript bundle with appropriate headers
    return new NextResponse(bundleContent, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving plugin tab bundle:', error);
    return NextResponse.json(
      { error: 'Failed to serve tab bundle' },
      { status: 500 }
    );
  }
}