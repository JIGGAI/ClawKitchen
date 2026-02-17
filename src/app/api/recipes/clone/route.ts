import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { NextResponse } from "next/server";
import { getWorkspaceRecipesDir } from "@/lib/paths";
import { runOpenClaw } from "@/lib/openclaw";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    fromId?: string;
    toId?: string;
    toName?: string;
    overwrite?: boolean;
    scaffold?: boolean;
  };

  const fromId = String(body.fromId ?? "").trim();
  const toId = String(body.toId ?? "").trim();
  const toName = typeof body.toName === "string" ? body.toName : undefined;
  const overwrite = Boolean(body.overwrite);
  const scaffold = Boolean(body.scaffold);

  if (!fromId) return NextResponse.json({ ok: false, error: "Missing fromId" }, { status: 400 });
  if (!toId) return NextResponse.json({ ok: false, error: "Missing toId" }, { status: 400 });

  // Allow any workspace recipe id (no required prefix).
  // Load source markdown from OpenClaw CLI (no HTTP self-call; avoids dev-server deadlocks/timeouts).
  const shown = await runOpenClaw(["recipes", "show", fromId]);
  if (!shown.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          shown.stderr.trim() ||
          `openclaw recipes show ${fromId} failed (exit=${shown.exitCode}). Is the recipes plugin enabled?`,
      },
      { status: 400 },
    );
  }

  const original = String(shown.stdout ?? "");

  // Patch the frontmatter for the new recipe id/name.
  // For team recipes, also patch team.teamId so downstream scaffold targets the new team workspace.
  // (Agent ids for team members are derived from teamId + role by scaffold-team.)
  if (!original.startsWith("---\n")) throw new Error("Recipe markdown must start with YAML frontmatter (---)");
  const end = original.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Recipe frontmatter not terminated (---)");
  const yamlText = original.slice(4, end + 1);
  const fm = (YAML.parse(yamlText) ?? {}) as Record<string, unknown>;
  const kind = String(fm.kind ?? "").trim().toLowerCase();

  const patched: Record<string, unknown> = {
    ...fm,
    id: toId,
    ...(toName ? { name: toName } : {}),
    ...(kind === "team"
      ? {
          team: {
            ...(typeof fm.team === "object" && fm.team ? (fm.team as Record<string, unknown>) : {}),
            teamId: toId,
          },
        }
      : {}),
  };

  const nextYaml = YAML.stringify(patched).trimEnd();
  const next = `---\n${nextYaml}\n---\n${original.slice(end + 5)}`;

  function suggestIds(baseId: string) {
    const b = String(baseId || "recipe").trim();
    // Keep it simple/predictable: no timestamps, just common prefixes + auto-increment style.
    return [`custom-${b}`, `my-${b}`, `${b}-2`, `${b}-alt`];
  }

  const dir = await getWorkspaceRecipesDir();
  const filePath = path.join(dir, `${toId}.md`);

  try {
    await fs.stat(filePath);
    if (!overwrite) {
      return NextResponse.json(
        {
          ok: false,
          error: `Recipe id already exists: ${toId}. Choose a different id (e.g. ${suggestIds(toId).join(", ")}).`,
          code: "RECIPE_ID_TAKEN",
          recipeId: toId,
          suggestions: suggestIds(toId),
          filePath,
        },
        { status: 409 },
      );
    }
  } catch {
    // doesn't exist
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, next, "utf8");

  // Optional: scaffold workspace files immediately so "clone" yields a functional team/agent.
  // IMPORTANT: scaffold failures should not delete/undo the cloned recipe markdown.
  let scaffoldResult:
    | { ok: true; stdout: string; stderr: string; exitCode: number }
    | { ok: false; error: string; stdout: string; stderr: string; exitCode: number | null }
    | null = null;

  if (scaffold) {
    const cmd =
      kind === "team"
        ? ["recipes", "scaffold-team", toId, "--team-id", toId, "--overwrite"]
        : kind === "agent"
          ? ["recipes", "scaffold", toId, "--agent-id", toId, "--overwrite"]
          : null;

    if (!cmd) {
      scaffoldResult = {
        ok: false,
        error: `Unsupported recipe kind for scaffold: ${kind || "(missing kind)"}`,
        stdout: "",
        stderr: "",
        exitCode: null,
      };
    } else {
      const r = await runOpenClaw(cmd);
      if (r.ok) {
        scaffoldResult = { ok: true, stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? ""), exitCode: r.exitCode };
      } else {
        scaffoldResult = {
          ok: false,
          error: r.stderr.trim() || `openclaw ${cmd.join(" ")} failed (exit=${r.exitCode})`,
          stdout: String(r.stdout ?? ""),
          stderr: String(r.stderr ?? ""),
          exitCode: r.exitCode,
        };
      }
    }
  }

  return NextResponse.json({ ok: true, filePath, recipeId: toId, content: next, scaffold: scaffoldResult });
}
