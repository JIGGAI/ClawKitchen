import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { findRecipeById } from "@/lib/recipes";
import { readOpenClawConfig, teamDirFromBaseWorkspace } from "@/lib/paths";
import { buildScaffoldArgs, type ScaffoldReqBody } from "@/lib/scaffold";

const asString = (v: unknown) => {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return new TextDecoder().decode(v);
  if (v && typeof (v as { toString?: unknown }).toString === "function") return String(v);
  return "";
};

const TEAM_META_FILE = "team.json";

async function applyCronOverride(override: "yes" | "no"): Promise<string | null> {
  const cfgPath = "plugins.entries.recipes.config.cronInstallation";
  const prev = await runOpenClaw(["config", "get", cfgPath]);
  const prevValue = prev.stdout.trim() || null;
  const next = override === "yes" ? "on" : "off";
  await runOpenClaw(["config", "set", cfgPath, next]);
  return prevValue;
}

async function getRecipeName(recipeId: string): Promise<string | undefined> {
  const item = await findRecipeById(recipeId);
  const n = String(item?.name ?? "").trim();
  return n || undefined;
}

async function persistTeamProvenance(body: Extract<ScaffoldReqBody, { kind: "team" }>): Promise<void> {
  const teamId = String(body.teamId ?? "").trim();
  if (!teamId) return;
  try {
    const cfg = await readOpenClawConfig();
    const baseWorkspace = String(cfg.agents?.defaults?.workspace ?? "").trim();
    if (!baseWorkspace) return;

    const teamDir = teamDirFromBaseWorkspace(baseWorkspace, teamId);
    const recipeName = await getRecipeName(body.recipeId);

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
  } catch {
    // best-effort only; scaffold should still succeed
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as ScaffoldReqBody & { cronInstallChoice?: "yes" | "no" };

  const args = buildScaffoldArgs(body);
  let prevCronInstallation: string | null = null;

  try {
    if (body.cronInstallChoice === "yes" || body.cronInstallChoice === "no") {
      prevCronInstallation = await applyCronOverride(body.cronInstallChoice);
    }

    const { stdout, stderr } = await runOpenClaw(args);

    if (body.kind === "team") {
      await persistTeamProvenance(body);
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

