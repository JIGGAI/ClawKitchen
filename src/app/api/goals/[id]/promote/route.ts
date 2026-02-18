import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { execFileAsync } from "@/lib/exec";
import { slugifyFilePart, ensureWorkflowInstructions } from "@/lib/goal-promote";
import { errorMessage } from "@/lib/errors";
import { goalErrorStatus, readGoal, writeGoal } from "@/lib/goals";
import { getTeamWorkspaceDir, readOpenClawConfig } from "@/lib/paths";

async function tryLeadPing(
  cfg: Awaited<ReturnType<typeof readOpenClawConfig>>,
  inboxPath: string,
  title: string,
  goalId: string
): Promise<{ attempted: boolean; ok: boolean; reason: string | null }> {
  const targetAgentId = "development-team-lead";
  const enabled = cfg.tools?.agentToAgent?.enabled === true;
  const allow = cfg.tools?.agentToAgent?.allow ?? [];
  const permitted = enabled && (allow.includes("*") || allow.includes(targetAgentId));

  if (!permitted) {
    const reason = enabled
      ? `agentToAgent.allow does not include "*" or "${targetAgentId}"`
      : "tools.agentToAgent.enabled is false";
    return { attempted: false, ok: false, reason };
  }

  try {
    await execFileAsync(
      "openclaw",
      [
        "agent",
        "--agent",
        targetAgentId,
        "--message",
        `New goal promoted to development-team inbox: ${title} (${goalId}). Inbox file: ${inboxPath}`,
        "--timeout",
        "60",
        "--json",
      ],
      { timeout: 70000 }
    );
    return { attempted: true, ok: true, reason: null };
  } catch (e: unknown) {
    return { attempted: true, ok: false, reason: errorMessage(e) };
  }
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
    const stamp = received.replace(/[-:]/g, "").split(".")[0] ?? received;
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

    const cfg = await readOpenClawConfig();
    const ping = await tryLeadPing(cfg, inboxPath, updated.frontmatter.title, goalId);

    return NextResponse.json({
      ok: true,
      goal: updated.frontmatter,
      inboxPath,
      pingAttempted: ping.attempted,
      pingOk: ping.ok,
      pingReason: ping.reason,
    });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    const status = goalErrorStatus(msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
