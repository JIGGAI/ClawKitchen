import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { slugifyFilePart, ensureWorkflowInstructions } from "@/lib/goal-promote";
import { goalErrorResponse, readGoal, writeGoal } from "@/lib/goals";
import { getTeamWorkspaceDir, readOpenClawConfig } from "@/lib/paths";
import { errorMessage } from "@/lib/errors";
import { runOpenClaw } from "@/lib/openclaw";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const goalId = decodeURIComponent(id);

    const existing = await readGoal(goalId);
    if (!existing) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

    // 1) Create inbox item for the goal's first team (or require ?team= param)
    const teams = Array.isArray(existing.frontmatter.teams) ? existing.frontmatter.teams.filter((t: string) => t && t !== "main") : [];
    const teamId = teams[0];
    if (!teamId) {
      return NextResponse.json({ error: "Goal has no team assigned. Add a team to the goal before promoting." }, { status: 400 });
    }
    const teamWs = await getTeamWorkspaceDir(teamId);
    const inboxDir = path.join(teamWs, "inbox");
    await fs.mkdir(inboxDir, { recursive: true });

    const received = new Date().toISOString();
    const stamp = received.replace(/[-:]/g, "").split(".")[0] ?? received;
    const titlePart = slugifyFilePart(existing.frontmatter.title || goalId);
    const filename = `${received.slice(0, 10)}-${received.slice(11, 16).replace(":", "")}-goal-${titlePart || goalId}.md`;

    const inboxBody = [
      `# Inbox — ${teamId}`,
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

    const cfg = await readOpenClawConfig();
    const enabled = cfg.tools?.agentToAgent?.enabled === true;
    const allow = cfg.tools?.agentToAgent?.allow ?? [];
    const targetAgentId = `${teamId}-lead`;
    const permitted = enabled && (allow.includes("*") || allow.includes(targetAgentId));

    let pingAttempted = false;
    let pingOk = false;
    let pingReason: string | null = null;

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
          `New goal promoted to ${teamId} inbox: ${updated.frontmatter.title} (${goalId}). Inbox file: ${inboxPath}`,
          "--timeout",
          "60",
          "--json",
        ]);
        if (!res.ok) throw new Error(res.stderr || `openclaw exit ${res.exitCode}`);
        pingOk = true;
      } catch (e: unknown) {
        pingReason = errorMessage(e);
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
    return goalErrorResponse(e);
  }
}
