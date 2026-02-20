import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { runOpenClaw } from "@/lib/openclaw";
import { readOpenClawConfig } from "@/lib/paths";

type Kind = "team" | "agent";

type Snapshot = {
  atMs: number;
  recipeIds: Set<string>;
  agentIds: Set<string>;
};

const SNAPSHOT_TTL_MS = 10_000;
let snapshot: Snapshot | null = null;
let snapshotPromise: Promise<Snapshot> | null = null;

function normalizeId(v: unknown) {
  return String(v ?? "").trim();
}

async function getSnapshot(): Promise<Snapshot> {
  const now = Date.now();
  if (snapshot && now - snapshot.atMs < SNAPSHOT_TTL_MS) return snapshot;
  if (snapshotPromise) return snapshotPromise;

  snapshotPromise = (async () => {
    const [recipesRes, agentsRes] = await Promise.all([
      runOpenClaw(["recipes", "list"]),
      runOpenClaw(["agents", "list", "--json"]),
    ]);

    const recipeIds = new Set<string>();
    if (recipesRes.ok) {
      try {
        const items = JSON.parse(recipesRes.stdout) as Array<{ id?: unknown }>;
        for (const r of items) {
          const id = normalizeId(r.id);
          if (id) recipeIds.add(id);
        }
      } catch {
        // ignore
      }
    }

    const agentIds = new Set<string>();
    if (agentsRes.ok) {
      try {
        const items = JSON.parse(agentsRes.stdout) as Array<{ id?: unknown }>;
        for (const a of items) {
          const id = normalizeId(a.id);
          if (id) agentIds.add(id);
        }
      } catch {
        // ignore
      }
    }

    const s: Snapshot = { atMs: now, recipeIds, agentIds };
    snapshot = s;
    snapshotPromise = null;
    return s;
  })();

  return snapshotPromise;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const kind = normalizeId(url.searchParams.get("kind")) as Kind;
    const id = normalizeId(url.searchParams.get("id"));

    if (kind !== "team" && kind !== "agent") {
      return NextResponse.json({ ok: false, error: "kind must be team|agent" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ ok: true, available: false, reason: "empty" });
    }

    const snap = await getSnapshot();

    // Disallow collisions with any recipe id.
    if (snap.recipeIds.has(id)) {
      return NextResponse.json({ ok: true, available: false, reason: "recipe-id-collision" });
    }

    if (kind === "agent") {
      if (snap.agentIds.has(id)) return NextResponse.json({ ok: true, available: false, reason: "agent-exists" });
      return NextResponse.json({ ok: true, available: true });
    }

    // Team id: check team workspace dir and any team agents prefix.
    try {
      const cfg = await readOpenClawConfig();
      const baseWorkspace = normalizeId(cfg.agents?.defaults?.workspace);
      if (baseWorkspace) {
        const teamDir = path.resolve(baseWorkspace, "..", `workspace-${id}`);
        const hasDir = await fs
          .stat(teamDir)
          .then(() => true)
          .catch(() => false);
        if (hasDir) return NextResponse.json({ ok: true, available: false, reason: "team-workspace-exists" });
      }
    } catch {
      // ignore
    }

    const snap2 = await getSnapshot();
    const hasAgents = Array.from(snap2.agentIds).some((a) => a.startsWith(`${id}-`));
    if (hasAgents) return NextResponse.json({ ok: true, available: false, reason: "team-agents-exist" });

    return NextResponse.json({ ok: true, available: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
