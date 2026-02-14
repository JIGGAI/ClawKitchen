import fs from "node:fs/promises";
import path from "node:path";
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

function teamDirFromTeamId(baseWorkspace: string, teamId: string) {
  return path.resolve(baseWorkspace, "..", `workspace-${teamId}`);
}

const TEAM_META_FILE = "team.json";

export async function POST(req: Request) {
  const body = (await req.json()) as ReqBody & { cronInstallChoice?: "yes" | "no" };

  const args: string[] = ["recipes", body.kind === "team" ? "scaffold-team" : "scaffold", body.recipeId];

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
    if (override === "yes" || override === "no") {
      const cfgPath = "plugins.entries.recipes.config.cronInstallation";
      const prev = await runOpenClaw(["config", "get", cfgPath]);
      prevCronInstallation = prev.stdout.trim() || null;
      const next = override === "yes" ? "on" : "off";
      await runOpenClaw(["config", "set", cfgPath, next]);
    }

    const { stdout, stderr } = await runOpenClaw(args);

    // Persist team provenance so the Team editor can lock the correct parent recipe.
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

