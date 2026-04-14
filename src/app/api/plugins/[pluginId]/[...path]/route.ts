import { NextRequest, NextResponse } from "next/server";
import { discoverKitchenPlugins, createPluginContext } from "@/lib/kitchen-plugins";
import { isPluginEnabledForTeam, resolveTeamDir } from "@/lib/team-plugins";
import { createRequire } from "module";

// createRequire gives us a real require() that works in ESM.
// new Function hides the dynamic path from Turbopack static analysis.
const _cjsRequire = createRequire(import.meta.url);
 
const _loadPlugin = new Function("req", "p",
  "delete req.cache[req.resolve(p)]; return req(p);"
) as (req: NodeRequire, p: string) => Record<string, unknown>;

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

    // Load plugin module at runtime — _loadPlugin passes the real require
    // into a Function-constructed wrapper so Turbopack never sees the path.
    const apiModule = _loadPlugin(_cjsRequire, plugin.apiRoutes);
    
    // Get team directory from query params or headers
    const teamId = request.nextUrl.searchParams.get('teamId') || 
                   request.nextUrl.searchParams.get('team') || 
                   request.headers.get('x-team-id') || 
                   'default';
    if (teamId !== 'default' && !(await isPluginEnabledForTeam(teamId, pluginId))) {
      return NextResponse.json(
        { error: 'Plugin is not enabled for this team' },
        { status: 403 }
      );
    }
    const teamDir = teamId === 'default' ? `~/.openclaw/workspace-${teamId}` : await resolveTeamDir(teamId);
    
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

      const response = await (apiModule.handleRequest as (req: unknown, ctx: unknown) => Promise<{ data?: unknown; status?: number; headers?: Record<string, string> }>)(pluginRequest, context);
      
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
