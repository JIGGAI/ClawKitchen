import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { listWorkspaceFiles, withTeamContextFromQuery } from "@/lib/api-route-helpers";

export async function GET(req: Request) {
  return withTeamContextFromQuery(req, async ({ teamId, teamDir }) => {
    // QA checklist should only be required when:
  // - the team has a test role, and/or
  // - the recipe opts in via frontmatter (qaChecklist: true)
    const hasTestRole = await (async () => {
    try {
      const st = await fs.stat(path.join(teamDir, "roles", "test"));
      return st.isDirectory();
    } catch {
      return false;
    }
    })();

    const recipeOptsIn = await (async () => {
    try {
      const teamJsonPath = path.join(teamDir, "team.json");
      const raw = await fs.readFile(teamJsonPath, "utf8");
      const parsed = JSON.parse(raw) as { recipeId?: unknown };
      const recipeId = String(parsed.recipeId ?? "").trim();
      if (!recipeId) return false;

      // Load recipe frontmatter via OpenClaw CLI and check for qaChecklist: true.
      // `recipes show` takes ~18s on this machine and is the dominant cost of
      // the team-editor mount (5 endpoints fetch in parallel, slowest one
      // wins). Cache for 5 min — recipes change rarely; PUT /api/recipes/[id]
      // invalidates after writes.
      const { cachedRunOpenClaw } = await import("@/lib/openclaw-cache");
      const shown = await cachedRunOpenClaw(["recipes", "show", recipeId], { ttlMs: 5 * 60_000 });
      if (!shown.ok) return false;
      const md = String(shown.stdout ?? "");
      if (!md.startsWith("---\n")) return false;
      const end = md.indexOf("\n---\n", 4);
      if (end === -1) return false;
      const yamlText = md.slice(4, end);
      const { default: YAML } = await import("yaml");
      const fm = (YAML.parse(yamlText) ?? {}) as { qaChecklist?: unknown };
      return Boolean(fm.qaChecklist);
    } catch {
      return false;
    }
    })();

    const qaChecklistRequired = hasTestRole || recipeOptsIn;

    const candidates: Array<{ name: string; required: boolean; rationale: string }> = [
    { name: "TEAM.md", required: true, rationale: "Team workspace overview" },
    { name: "TICKETS.md", required: true, rationale: "Ticket workflow + format" },
    { name: "notes/QA_CHECKLIST.md", required: qaChecklistRequired, rationale: "QA verification checklist" },

    { name: "SOUL.md", required: false, rationale: "Optional team persona (some teams use role SOUL.md only)" },
    { name: "USER.md", required: false, rationale: "Optional user profile" },
    { name: "AGENTS.md", required: false, rationale: "Optional team notes (often role-scoped)" },
    { name: "TOOLS.md", required: false, rationale: "Optional team-local tooling notes" },
    { name: "MEMORY.md", required: false, rationale: "Optional curated memory" },
    ];

    const files = await listWorkspaceFiles(teamDir, candidates);

    return NextResponse.json({ ok: true, teamId, teamDir, files });
  });
}
