import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { NextResponse } from "next/server";
import { getWorkspaceRecipesDir } from "@/lib/paths";

function updateFrontmatter(md: string, patch: Record<string, unknown>) {
  if (!md.startsWith("---\n")) throw new Error("Recipe markdown must start with YAML frontmatter (---)");
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Recipe frontmatter not terminated (---)");
  const yamlText = md.slice(4, end + 1);
  const fm = (YAML.parse(yamlText) ?? {}) as Record<string, unknown>;
  const next = { ...fm, ...patch };
  const nextYaml = YAML.stringify(next).trimEnd();
  return `---\n${nextYaml}\n---\n${md.slice(end + 5)}`;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    fromId?: string;
    toId?: string;
    toName?: string;
    overwrite?: boolean;
  };

  const fromId = String(body.fromId ?? "").trim();
  const toId = String(body.toId ?? "").trim();
  const toName = typeof body.toName === "string" ? body.toName : undefined;
  const overwrite = Boolean(body.overwrite);

  if (!fromId) return NextResponse.json({ ok: false, error: "Missing fromId" }, { status: 400 });
  if (!toId) return NextResponse.json({ ok: false, error: "Missing toId" }, { status: 400 });

  // Load source markdown via existing API surface.
  const shown = await fetch(`${new URL(req.url).origin}/api/recipes/${encodeURIComponent(fromId)}`, {
    cache: "no-store",
  });
  const shownJson = (await shown.json()) as { recipe?: { content?: string } } & { error?: string };
  if (!shown.ok) {
    return NextResponse.json({ ok: false, error: shownJson.error || `Failed to load recipe: ${fromId}` }, { status: 400 });
  }

  const original = String(shownJson.recipe?.content ?? "");
  const next = updateFrontmatter(original, { id: toId, ...(toName ? { name: toName } : {}) });

  const dir = await getWorkspaceRecipesDir();
  const filePath = path.join(dir, `${toId}.md`);

  try {
    if (!overwrite) {
      await fs.stat(filePath);
      return NextResponse.json(
        { ok: false, error: `Refusing to overwrite existing recipe: ${filePath}. Pass overwrite=true to replace.` },
        { status: 409 },
      );
    }
  } catch {
    // doesn't exist
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, next, "utf8");

  return NextResponse.json({ ok: true, filePath, recipeId: toId, content: next });
}
