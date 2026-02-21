import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { readGoal, writeGoal } from "@/lib/goals";
import { getTeamWorkspaceDir, readOpenClawConfig } from "@/lib/paths";
import { runOpenClaw } from "@/lib/openclaw";

function slugifyFilePart(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const WORKFLOW_MARKER = "<!-- goal-workflow -->";

function ensureWorkflowInstructions(body: string) {
  if (body.includes(WORKFLOW_MARKER)) return body;
  const snippet = [
    "",
    "## Workflow",
    WORKFLOW_MARKER,
    "- Use **Promote to inbox** to send this goal to the development-team inbox for scoping.",
    "- When promoted, set goal status to **active**.",
    "- Track implementation work via tickets (add links/IDs under a **Tickets** section in this goal).",
    "- When development is complete (all associated tickets marked done), set goal status to **done**.",
    "",
    "## Tickets",
    "- (add ticket links/ids)",
    "",
  ].join("\n");

  return (body ?? "").trim() + snippet;
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const goalId = decodeURIComponent(id);

    const existing = await readGoal(goalId);
    if (!existing) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

    // 1) Create inbox item for development-team lead to scope
    const teamId = "development-team";
    const teamWs = await getTeamWorkspaceDir(teamId);
    const inboxDir = path.join(teamWs, "inbox");
    await fs.mkdir(inboxDir, { recursive: true });

    const received = new Date().toISOString();
    const stamp = received.replace(/[-:]/g, "").replace(/\..+$/, "");
    const titlePart = slugifyFilePart(existing.frontmatter.title || goalId);
    const filename = `${received.slice(0, 10)}-${received.slice(11, 16).replace(":", "")}-goal-${titlePart || goalId}.md`;

    const inboxBody = [
      "# Inbox — development-team",
      "",
      `Received: ${received}`,
      "",
      "## Request",
      `Goal: ${existing.frontmatter.title} (${goalId})`,
      "",
      "## Proposed work",
      "- Ticket: (lead to create during scoping)",
      "- Owner: lead",
      "",
      "## Links",
      `- Goal UI: /goals/${encodeURIComponent(goalId)}`,
      `- Goal file: ~/.openclaw/workspace/notes/goals/${goalId}.md`,
      "",
      "## Goal body (snapshot)",
      existing.body?.trim() ? existing.body.trim() : "(empty)",
      "",
    ].join("\n");

    const inboxPath = path.join(inboxDir, filename);
    await fs.writeFile(inboxPath, inboxBody, { encoding: "utf8", flag: "wx" }).catch(async (e: unknown) => {
      const code = (e && typeof e === "object" && "code" in e) ? String((e as { code?: unknown }).code) : "";
      if (code === "EEXIST") {
        const alt = path.join(inboxDir, filename.replace(/\.md$/, `-${stamp}.md`));
        await fs.writeFile(alt, inboxBody, { encoding: "utf8", flag: "wx" });
        return;
      }
      throw e;
    });

    // 2) Mark goal active + ensure workflow instructions exist
    const updatedBody = ensureWorkflowInstructions(existing.body ?? "");
    const updated = await writeGoal({
      id: goalId,
      title: existing.frontmatter.title,
      status: "active",
      tags: existing.frontmatter.tags,
      teams: existing.frontmatter.teams,
      body: updatedBody,
    });

    // 3) Optional lead ping only if config is permissive
    let pingAttempted = false;
    let pingOk = false;
    let pingReason: string | null = null;

    const cfg = await readOpenClawConfig();
    const enabled = cfg.tools?.agentToAgent?.enabled === true;
    const allow = cfg.tools?.agentToAgent?.allow ?? [];
    const targetAgentId = "development-team-lead";
    const permitted = enabled && (allow.includes("*") || allow.includes(targetAgentId));

    if (!permitted) {
      pingReason = enabled
        ? `agentToAgent.allow does not include "*" or "${targetAgentId}"`
        : "tools.agentToAgent.enabled is false";
    } else {
      pingAttempted = true;
      try {
        const res = await runOpenClaw([
          "agent",
          "--agent",
          targetAgentId,
          "--message",
          `New goal promoted to development-team inbox: ${updated.frontmatter.title} (${goalId}). Inbox file: ${inboxPath}`,
          "--timeout",
          "60",
          "--json",
        ]);
        if (!res.ok) throw new Error(res.stderr || `openclaw exit ${res.exitCode}`);
        pingOk = true;
      } catch (e: unknown) {
        pingReason = e instanceof Error ? e.message : String(e);
      }
    }

    return NextResponse.json({
      ok: true,
      goal: updated.frontmatter,
      inboxPath,
      pingAttempted,
      pingOk,
      pingReason,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /Invalid goal id|Path traversal/.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
