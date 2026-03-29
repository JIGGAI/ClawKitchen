import { NextResponse } from "next/server";
import { discoverKitchenPlugins } from "@/lib/kitchen-plugins";

export async function GET() {
  try {
    const plugins = discoverKitchenPlugins();
    
    return NextResponse.json({
      success: true,
      pluginCount: plugins.size,
      plugins: Array.from(plugins.values()).map(plugin => ({
        id: plugin.id,
        name: plugin.name,
        teamTypes: plugin.teamTypes,
        tabCount: plugin.tabs.length,
      })),
    });
  } catch (error) {
    console.error('Error testing plugin discovery:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}