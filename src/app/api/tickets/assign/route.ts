import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getTeamWorkspaceDir, getTicketByIdOrNumber, listTickets, stageDir, type TicketStage } from "@/lib/tickets";

type TicketFlowConfig = {
  laneByOwner?: Record<string, TicketStage>;
  defaultLane?: TicketStage;
};

async function loadTicketFlowConfig(teamDir: string): Promise<TicketFlowConfig | null> {
  const p = path.join(teamDir, "shared-context", "ticket-flow.json");
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as TicketFlowConfig;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function desiredStageForAssignee(opts: {
  teamDir: string;
  assignee: string | null;
  currentStage: TicketStage;
}): Promise<TicketStage> {
  const config = await loadTicketFlowConfig(opts.teamDir);
  if (!config) return opts.currentStage;

  const key = (opts.assignee ?? "").trim();
  if (key && config.laneByOwner && typeof config.laneByOwner[key] === "string") {
    return config.laneByOwner[key] as TicketStage;
  }

  if (config.defaultLane) return config.defaultLane;
  return opts.currentStage;
}

function upsertField(md: string, field: string, value: string) {
  const re = new RegExp(`^${field}:\\s*.*$`, "mi");
  if (re.test(md)) return md.replace(re, `${field}: ${value}`);

  // Insert after the first header line, or at top if no header.
  const lines = md.split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("# "));
  const insertAt = headerIdx >= 0 ? headerIdx + 1 : 0;
  lines.splice(insertAt, 0, `${field}: ${value}`);
  return lines.join("\n");
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as null | {
    ticket: string;
    assignee: string;
    teamId?: string;
  };

  if (!body?.ticket || !body?.assignee) {
    return NextResponse.json({ error: "Missing ticket or assignee" }, { status: 400 });
  }

  const teamId = String(body.teamId ?? "").trim();
  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  const teamDir = getTeamWorkspaceDir(teamId);
  const ticket = await getTicketByIdOrNumber(body.ticket, teamId);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const assignee = body.assignee.trim();
  const nextStage = await desiredStageForAssignee({ teamDir, assignee, currentStage: ticket.stage });

  const currentMd = await fs.readFile(ticket.file, "utf8");
  let updatedMd = upsertField(currentMd, "Owner", assignee);
  // Keep Status in sync with lane.
  updatedMd = upsertField(updatedMd, "Status", nextStage);

  const filename = path.basename(ticket.file);
  const nextPath = path.join(stageDir(nextStage, teamId), filename);

  await ensureDir(stageDir(nextStage, teamId));

  if (ticket.file !== nextPath) {
    await fs.rename(ticket.file, nextPath);
  }

  await fs.writeFile(nextPath, updatedMd, "utf8");

  // Assignment stubs are deprecated; do not create/update work/assignments/*.md.

  const refreshed = (await listTickets(teamId)).find((t) => t.number === ticket.number);
  return NextResponse.json({ ok: true, ticket: refreshed ?? null });
}
