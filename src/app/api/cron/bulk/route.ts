import { NextResponse } from "next/server";
import { toolsInvoke } from "@/lib/gateway";
import { runOpenClaw } from "@/lib/openclaw";
import { invalidateOpenClawCache } from "@/lib/openclaw-cache";
import { getBaseWorkspaceFromGateway, markOrphanedInTeamWorkspaces } from "../helpers";

type BulkAction = "enable" | "disable" | "delete";

export async function POST(req: Request) {
  const body = (await req.json()) as { ids?: string[]; action?: string };
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [];
  const action = String(body.action ?? "").trim() as BulkAction;

  if (!ids.length) return NextResponse.json({ ok: false, error: "ids array is required" }, { status: 400 });
  if (!["enable", "disable", "delete"].includes(action)) {
    return NextResponse.json({ ok: false, error: "action must be enable|disable|delete" }, { status: 400 });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  // For delete, resolve base workspace once upfront.
  let baseWorkspace = "";
  if (action === "delete") {
    try {
      baseWorkspace = await getBaseWorkspaceFromGateway(toolsInvoke);
    } catch {
      // proceed without orphan marking
    }
  }

  for (const id of ids) {
    try {
      if (action === "delete") {
        const result = await runOpenClaw(["cron", "rm", id, "--json"]);
        if (!result.ok) {
          results.push({ id, ok: false, error: result.stderr || result.stdout });
          continue;
        }
        if (baseWorkspace) {
          try {
            await markOrphanedInTeamWorkspaces(id, baseWorkspace);
          } catch {
            // ignore orphan marking failures
          }
        }
      } else {
        const result = await runOpenClaw(["cron", action, id]);
        if (!result.ok) {
          results.push({ id, ok: false, error: result.stderr || result.stdout });
          continue;
        }
      }
      results.push({ id, ok: true });
    } catch (e: unknown) {
      results.push({ id, ok: false, error: String(e) });
    }
  }

  // Any successful mutation invalidates the cron list cache so the next
  // /api/cron/jobs read returns fresh state.
  if (results.some((r) => r.ok)) invalidateOpenClawCache(["cron", "list"]);

  const errors = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: errors.length === 0,
    results,
    errors,
    count: results.filter((r) => r.ok).length,
  });
}
