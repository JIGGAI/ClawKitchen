import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { readOpenClawConfig } from "@/lib/paths";

type ReqBody =
  | {
      kind: "agent";
      recipeId: string;
      agentId?: string;
      name?: string;
      applyConfig?: boolean;
      overwrite?: boolean;
    }
  | {
      kind: "team";
      recipeId: string;
      teamId?: string;
      applyConfig?: boolean;
      overwrite?: boolean;
    };

const asString = (v: unknown) => {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return new TextDecoder().decode(v);
  if (v && typeof (v as { toString?: unknown }).toString === "function") return String(v);
  return "";
};

function sha256(text: string) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function teamDirFromTeamId(baseWorkspace: string, teamId: string) {
  return path.resolve(baseWorkspace, "..", `workspace-${teamId}`);
}

const TEAM_META_FILE = "team.json";
const AGENT_META_FILE = "agent.json";

export async function POST(req: Request) {
  const body = (await req.json()) as ReqBody & { cronInstallChoice?: "yes" | "no" };

  const args: string[] = ["recipes", body.kind === "team" ? "scaffold-team" : "scaffold", body.recipeId];

  // Used for "Publish changes" detection in the UI.
  // Best-effort only (we don't want to block scaffolding on hashing).
  let recipeHash: string | null = null;
  try {
    const shown = await runOpenClaw(["recipes", "show", body.recipeId]);
    if (shown.ok) recipeHash = sha256(shown.stdout);
  } catch {
    // ignore
  }

  if (body.overwrite) args.push("--overwrite");
  if (body.applyConfig) args.push("--apply-config");

  if (body.kind === "agent") {
    if (body.agentId) args.push("--agent-id", body.agentId);
    if (body.name) args.push("--name", body.name);
  } else {
    if (body.teamId) args.push("--team-id", body.teamId);
  }

  // Kitchen runs scaffold non-interactively, so the recipes plugin cannot prompt.
  // To emulate prompt semantics, we optionally override cronInstallation for this one scaffold run.
  let prevCronInstallation: string | null = null;
  const override = body.cronInstallChoice;

  try {
    // Collision guards: site-wide rules.
    // 1) Do not allow creating a team/agent with an id that collides with ANY recipe id.
    //    (BUT allow when overwrite=true, which is used for re-scaffolding/publish flows.)
    // 2) Do not allow creating a team/agent that already exists unless overwrite was explicitly set.
    if (!body.overwrite) {
      const recipesRes = await runOpenClaw(["recipes", "list"]);
      if (recipesRes.ok) {
        try {
          const recipes = JSON.parse(recipesRes.stdout) as Array<{ id?: unknown }>;
          const recipeIds = new Set(recipes.map((r) => String(r.id ?? "").trim()).filter(Boolean));

          if (body.kind === "agent") {
            const agentId = String(body.agentId ?? "").trim();
            if (agentId && recipeIds.has(agentId)) {
              return NextResponse.json(
                { ok: false, error: `Agent id cannot match an existing recipe id: ${agentId}. Choose a new agent id.` },
                { status: 409 },
              );
            }
          }

          if (body.kind === "team") {
            const teamId = String(body.teamId ?? "").trim();
            if (teamId && recipeIds.has(teamId)) {
              return NextResponse.json(
                { ok: false, error: `Team id cannot match an existing recipe id: ${teamId}. Choose a new team id.` },
                { status: 409 },
              );
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (!body.overwrite) {
      if (body.kind === "agent") {
        const agentId = String(body.agentId ?? "").trim();
        if (agentId) {
          const agentsRes = await runOpenClaw(["agents", "list", "--json"]);
          if (agentsRes.ok) {
            try {
              const agents = JSON.parse(agentsRes.stdout) as Array<{ id?: unknown }>;
              const exists = agents.some((a) => String(a.id ?? "").trim() === agentId);
              if (exists) {
                return NextResponse.json(
                  { ok: false, error: `Agent already exists: ${agentId}. Choose a new id or enable overwrite.` },
                  { status: 409 },
                );
              }
            } catch {
              // ignore parse errors; fall through to scaffold
            }
          }
        }
      }

      if (body.kind === "team") {
        const teamId = String(body.teamId ?? "").trim();
        if (teamId) {
          try {
            const cfg = await readOpenClawConfig();
            const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
            if (baseWorkspace) {
              const teamDir = teamDirFromTeamId(baseWorkspace, teamId);
              const hasWorkspace = await fs
                .stat(teamDir)
                .then(() => true)
                .catch(() => false);
              if (hasWorkspace) {
                return NextResponse.json(
                  { ok: false, error: `Team workspace already exists: ${teamId}. Choose a new id or enable overwrite.` },
                  { status: 409 },
                );
              }
            }
          } catch {
            // ignore and fall through
          }

          // Also check if team agents already exist in config.
          const agentsRes = await runOpenClaw(["agents", "list", "--json"]);
          if (agentsRes.ok) {
            try {
              const agents = JSON.parse(agentsRes.stdout) as Array<{ id?: unknown }>;
              const hasAgents = agents.some((a) => String(a.id ?? "").startsWith(`${teamId}-`));
              if (hasAgents) {
                return NextResponse.json(
                  { ok: false, error: `Team agents already exist for team: ${teamId}. Choose a new id or enable overwrite.` },
                  { status: 409 },
                );
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    }

    if (override === "yes" || override === "no") {
      const cfgPath = "plugins.entries.recipes.config.cronInstallation";
      const prev = await runOpenClaw(["config", "get", cfgPath]);
      prevCronInstallation = prev.stdout.trim() || null;
      const next = override === "yes" ? "on" : "off";
      await runOpenClaw(["config", "set", cfgPath, next]);
    }

    const { stdout, stderr } = await runOpenClaw(args);

    // Persist provenance so editors can show what recipe created what.
    if (body.kind === "team") {
      const teamId = String(body.teamId ?? "").trim();
      if (teamId) {
        try {
          const cfg = await readOpenClawConfig();
          const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
          if (baseWorkspace) {
            const teamDir = teamDirFromTeamId(baseWorkspace, teamId);

            // Best-effort recipe name snapshot.
            let recipeName: string | undefined;
            try {
              const list = await runOpenClaw(["recipes", "list"]);
              if (list.ok) {
                const items = JSON.parse(list.stdout) as Array<{ id?: string; name?: string }>;
                const hit = items.find((r) => String(r.id ?? "").trim() === body.recipeId);
                const n = String(hit?.name ?? "").trim();
                if (n) recipeName = n;
              }
            } catch {
              // ignore
            }

            const now = new Date().toISOString();
            const meta = {
              teamId,
              recipeId: body.recipeId,
              ...(recipeName ? { recipeName } : {}),
              ...(recipeHash ? { recipeHash } : {}),
              scaffoldedAt: now,
              attachedAt: now,
            };

            await fs.mkdir(teamDir, { recursive: true });
            await fs.writeFile(path.join(teamDir, TEAM_META_FILE), JSON.stringify(meta, null, 2) + "\n", "utf8");
          }
        } catch {
          // best-effort only; scaffold should still succeed
        }
      }
    }

    // Persist agent provenance so we can block recipe deletion while in use.
    if (body.kind === "agent") {
      const agentId = String(body.agentId ?? "").trim();
      if (agentId) {
        try {
          const cfg = await readOpenClawConfig();
          const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
          if (baseWorkspace) {
            const agentDir = path.resolve(baseWorkspace, "agents", agentId);

            // Best-effort recipe name snapshot.
            let recipeName: string | undefined;
            try {
              const list = await runOpenClaw(["recipes", "list"]);
              if (list.ok) {
                const items = JSON.parse(list.stdout) as Array<{ id?: string; name?: string }>;
                const hit = items.find((r) => String(r.id ?? "").trim() === body.recipeId);
                const n = String(hit?.name ?? "").trim();
                if (n) recipeName = n;
              }
            } catch {
              // ignore
            }

            const now = new Date().toISOString();
            const meta = {
              agentId,
              recipeId: body.recipeId,
              ...(recipeName ? { recipeName } : {}),
              ...(recipeHash ? { recipeHash } : {}),
              scaffoldedAt: now,
              attachedAt: now,
            };

            await fs.mkdir(agentDir, { recursive: true });
            await fs.writeFile(path.join(agentDir, AGENT_META_FILE), JSON.stringify(meta, null, 2) + "\n", "utf8");
          }
        } catch {
          // best-effort only
        }
      }
    }

    // If scaffold wrote to config, restart gateway so subsequent `openclaw agents list` reflects the new agent/team.
    if (body.applyConfig) {
      try {
        await runOpenClaw(["gateway", "restart"]);
      } catch {
        // best-effort: recipe scaffolding succeeded even if restart fails
      }
    }

    return NextResponse.json({ ok: true, args, stdout, stderr });
  } catch (e: unknown) {
    const err = e as { message?: string; stdout?: unknown; stderr?: unknown };
    return NextResponse.json(
      {
        ok: false,
        args,
        error: err?.message ?? String(e),
        stdout: asString(err?.stdout),
        stderr: asString(err?.stderr),
      },
      { status: 500 }
    );
  } finally {
    if (prevCronInstallation !== null) {
      try {
        await runOpenClaw(["config", "set", "plugins.entries.recipes.config.cronInstallation", prevCronInstallation]);
      } catch {
        // best-effort restore
      }
    }
  }
}

