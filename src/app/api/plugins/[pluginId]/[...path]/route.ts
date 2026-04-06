import { NextRequest, NextResponse } from "next/server";
import { discoverKitchenPlugins, createPluginContext } from "@/lib/kitchen-plugins";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string; path: string[] }> }
) {
  const resolvedParams = await params;
  return handlePluginApiRequest(request, resolvedParams, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string; path: string[] }> }
) {
  const resolvedParams = await params;
  return handlePluginApiRequest(request, resolvedParams, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string; path: string[] }> }
) {
  const resolvedParams = await params;
  return handlePluginApiRequest(request, resolvedParams, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string; path: string[] }> }
) {
  const resolvedParams = await params;
  return handlePluginApiRequest(request, resolvedParams, 'DELETE');
}

async function handlePluginApiRequest(
  request: NextRequest,
  { pluginId, path }: { pluginId: string; path: string[] },
  method: string
) {
  try {
    const plugins = discoverKitchenPlugins();
    const plugin = plugins.get(pluginId);

    if (!plugin) {
      return NextResponse.json(
        { error: 'Plugin not found' },
        { status: 404 }
      );
    }

    if (!plugin.apiRoutes) {
      return NextResponse.json(
        { error: 'Plugin does not expose API routes' },
        { status: 404 }
      );
    }

    // Load the plugin's API routes module
    // Use require() — dynamic import() fails with "expression is too dynamic"
    // because Next.js/webpack can't resolve absolute filesystem paths at build time.
    // Clear module cache so plugin updates take effect without full restart.
     
    delete require.cache[require.resolve(plugin.apiRoutes)];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const apiModule = require(plugin.apiRoutes);
    
    // Get team directory from query params or headers
    const teamId = request.nextUrl.searchParams.get('team') || 
                   request.headers.get('x-team-id') || 
                   'default';
    const teamDir = `~/.openclaw/workspace-${teamId}`;
    
    // Get auth token from session/headers
    const authToken = request.headers.get('authorization') || 
                     request.cookies.get('auth-token')?.value || 
                     'default-token';

    // Create plugin context
    const context = createPluginContext(pluginId, teamDir, authToken);

    // Build the API path
    const apiPath = `/${path.join('/')}`;

    // Call the plugin's API handler
    if (typeof apiModule.handleRequest === 'function') {
      const pluginRequest = {
        method,
        path: apiPath,
        query: Object.fromEntries(request.nextUrl.searchParams.entries()),
        headers: Object.fromEntries(request.headers.entries()),
        body: method !== 'GET' ? await request.json().catch(() => null) : null,
      };

      const response = await apiModule.handleRequest(pluginRequest, context);
      
      return NextResponse.json(response.data || response, {
        status: response.status || 200,
        headers: response.headers || {},
      });
    }

    return NextResponse.json(
      { error: 'Plugin API handler not found' },
      { status: 501 }
    );
  } catch (error) {
    console.error('Error handling plugin API request:', error);
    return NextResponse.json(
      { error: 'Plugin API request failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}