import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jsonOkRest, parseJsonBody } from "@/lib/api-route-helpers";
import { errorMessage } from "@/lib/errors";
import { getTeamWorkspaceDir } from "@/lib/paths";
import { listWorkflows, writeWorkflow } from "@/lib/workflows/storage";
import { marketingCadenceWorkflowV1 } from "@/lib/workflows/templates";

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function nextAvailableId(baseId: string, existing: Set<string>) {
  if (!existing.has(baseId)) return baseId;
  for (let i = 2; i < 1000; i++) {
    const id = `${baseId}-${i}`;
    if (!existing.has(id)) return id;
  }
  return `${baseId}-${Date.now()}`;
}

async function ensureFile(p: string, content: string) {
  if (await exists(p)) return;
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req);
  if (parsed instanceof NextResponse) return parsed;
  const { body: o } = parsed;

  const teamId = String(o.teamId ?? "").trim();
  const templateId = String(o.templateId ?? "").trim();

  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });
  if (!templateId) return NextResponse.json({ ok: false, error: "templateId is required" }, { status: 400 });

  try {
    if (templateId !== "marketing-cadence-v1") {
      return NextResponse.json({ ok: false, error: `Unknown templateId: ${templateId}` }, { status: 400 });
    }

    const listed = await listWorkflows(teamId);
    const existingIds = new Set(
      listed.files
        .map((f) => (typeof f === "string" && f.endsWith(".workflow.json") ? f.slice(0, -".workflow.json".length) : null))
        .filter((x): x is string => Boolean(x))
    );

    const id = nextAvailableId("marketing-cadence-v1", existingIds);

    const wf = marketingCadenceWorkflowV1({ id, approvalProvider: "telegram", approvalTarget: "" });
    const writeRes = await writeWorkflow(teamId, wf);

    // Ensure canonical file-first destinations exist so demo doesn't 404.
    const teamDir = await getTeamWorkspaceDir(teamId);
    await ensureFile(path.join(teamDir, "shared-context", "marketing", "POST_LOG.md"), "");
    await ensureFile(path.join(teamDir, "shared-context", "memory", "marketing_learnings.jsonl"), "");

    return jsonOkRest({ ...writeRes, workflowId: wf.id, templateId });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 500 });
  }
}
