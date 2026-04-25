import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { errorMessage } from "@/lib/errors";
import { getKitchenApi } from "@/lib/kitchen-api";
import { listAgentsCached, type AgentListItem } from "@/lib/agents";

type TmuxSession = {
  name: string;
  attached: boolean;
  windows?: number;
  created?: string;
};

type GitWorktree = {
  path: string;
  branch?: string;
  sha?: string;
};

function pickOrchestratorAgentId(teamId: string, agents: AgentListItem[]) {
  const candidates = [
    `${teamId}-swarm-orchestrator`,
    `${teamId}-orchestrator`,
    "swarm-orchestrator",
    "orchestrator",
  ];

  for (const id of candidates) {
    const match = agents.find((a) => a.id === id);
    if (match) return match;
  }

  // Heuristic fallback: any agent id containing "orchestrator" whose workspace path mentions the teamId.
  const heuristic = agents.find((a) => {
    const id = String(a.id ?? "");
    const ws = String(a.workspace ?? "");
    return id.includes("orchestrator") && (ws.includes(`/workspace-${teamId}`) || ws.includes(teamId));
  });
  return heuristic ?? null;
}

async function runCommand(argv: string[], timeoutMs = 8000) {
  const api = getKitchenApi();
  const res = (await api.runtime.system.runCommandWithTimeout(argv, { timeoutMs })) as {
    stdout?: unknown;
    stderr?: unknown;
  };
  return { stdout: String(res.stdout ?? ""), stderr: String(res.stderr ?? "") };
}

function parseTmuxList(stdout: string): TmuxSession[] {
  const lines = stdout
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);

  // Expected format:
  // name\tattached\twindows\tcreated
  return lines.map((line) => {
    const [name, attached, windows, created] = line.split("\t");
    return {
      name: String(name ?? "").trim(),
      attached: String(attached ?? "0").trim() === "1",
      windows: windows ? Number(windows) : undefined,
      created: created ? String(created) : undefined,
    };
  });
}

function parseWorktreePorcelain(stdout: string): GitWorktree[] {
  // `git worktree list --porcelain` is a list of blocks separated by blank lines.
  const blocks = stdout
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const wt: GitWorktree = { path: "" };
      for (const rawLine of block.split("\n")) {
        const line = rawLine.trim();
        if (line.startsWith("worktree ")) wt.path = line.slice("worktree ".length).trim();
        else if (line.startsWith("HEAD ")) wt.sha = line.slice("HEAD ".length).trim();
        else if (line.startsWith("branch ")) wt.branch = line.slice("branch ".length).trim();
      }
      return wt.path ? wt : null;
    })
    .filter((x): x is GitWorktree => Boolean(x));
}

async function firstExistingJsonFile(absCandidates: string[]) {
  for (const p of absCandidates) {
    try {
      const stat = await fs.stat(p);
      if (stat.isFile()) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const teamId = String(searchParams.get("teamId") ?? "").trim();
  if (!teamId) return NextResponse.json({ ok: false, error: "teamId is required" }, { status: 400 });

  try {
    const agents = await listAgentsCached();
    const match = pickOrchestratorAgentId(teamId, agents);

    if (!match || !match.workspace) {
      return NextResponse.json({
        ok: true,
        teamId,
        present: false,
        reason:
          "No orchestrator agent detected. Expected an agent id like <teamId>-swarm-orchestrator (or swarm-orchestrator).",
      });
    }

    const workspace = match.workspace;

    // tmux sessions (best-effort)
    let tmuxSessions: TmuxSession[] = [];
    try {
      const { stdout } = await runCommand([
        "tmux",
        "ls",
        "-F",
        "#S\t#{session_attached}\t#{session_windows}\t#{session_created_string}",
      ]);
      tmuxSessions = parseTmuxList(stdout);
    } catch {
      tmuxSessions = [];
    }

    // git worktrees (best-effort)
    let worktrees: GitWorktree[] = [];
    try {
      const { stdout } = await runCommand(["git", "-C", workspace, "worktree", "list", "--porcelain"], 12000);
      worktrees = parseWorktreePorcelain(stdout);
    } catch {
      worktrees = [];
    }

    // active tasks (best-effort)
    const activeTasksPath = await firstExistingJsonFile([
      path.join(workspace, "active-tasks.json"),
      path.join(workspace, ".clawdbot", "active-tasks.json"),
      path.join(workspace, "notes", "active-tasks.json"),
    ]);

    let activeTasksSummary: { path: string; taskCount?: number; rawType?: string } | null = null;
    if (activeTasksPath) {
      try {
        const raw = await fs.readFile(activeTasksPath, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          activeTasksSummary = { path: activeTasksPath, taskCount: parsed.length, rawType: "array" };
        } else if (parsed && typeof parsed === "object") {
          const obj = parsed as { tasks?: unknown };
          const tasks = Array.isArray(obj.tasks) ? obj.tasks : null;
          activeTasksSummary = {
            path: activeTasksPath,
            taskCount: tasks ? tasks.length : undefined,
            rawType: "object",
          };
        } else {
          activeTasksSummary = { path: activeTasksPath, rawType: typeof parsed };
        }
      } catch {
        activeTasksSummary = { path: activeTasksPath };
      }
    }

    const settingsPaths = [
      path.join(workspace, ".env"),
      path.join(workspace, ".clawdbot", "README.md"),
      path.join(workspace, ".clawdbot", "CONVENTIONS.md"),
      path.join(workspace, ".clawdbot", "PROMPT_TEMPLATE.md"),
      path.join(workspace, ".clawdbot", "TEMPLATE.md"),
    ];

    return NextResponse.json({
      ok: true,
      teamId,
      present: true,
      agent: {
        id: match.id,
        identityName: match.identityName,
        workspace,
      },
      tmuxSessions,
      worktrees,
      activeTasksSummary,
      settingsPaths,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
