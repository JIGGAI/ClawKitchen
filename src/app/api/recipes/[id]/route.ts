import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { findRecipeById, parseFrontmatterId, resolveRecipePath, writeRecipeFile } from "@/lib/recipes";
import { invalidateOpenClawCache } from "@/lib/openclaw-cache";

function sha256(text: string) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const item = await findRecipeById(id);
  if (!item) return NextResponse.json({ error: `Recipe not found: ${id}` }, { status: 404 });

  const filePath = await resolveRecipePath(item).catch(() => null);
  if (!filePath) return NextResponse.json({ error: `Recipe file not found: ${id}` }, { status: 404 });

  const content = await readFile(filePath, "utf8");
  const recipeHash = sha256(content);

  return NextResponse.json({ recipe: { ...item, content, filePath }, recipeHash });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as { content?: string };
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  // Validate frontmatter id matches route id.
  let parsedId: string;
  try {
    parsedId = parseFrontmatterId(body.content);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  if (parsedId !== id) {
    return NextResponse.json(
      { error: `Frontmatter id (${parsedId}) must match URL id (${id})` },
      { status: 400 }
    );
  }

  const item = await findRecipeById(id);
  if (!item) return NextResponse.json({ error: `Recipe not found: ${id}` }, { status: 404 });

  if (item.source === "builtin") {
    return NextResponse.json({ error: `Recipe ${id} is builtin and cannot be modified` }, { status: 403 });
  }

  const filePath = await resolveRecipePath(item);
  await writeRecipeFile(filePath, body.content);
  // Bust caches that depended on this recipe's contents.
  invalidateOpenClawCache(["recipes", "show", id], ["recipes", "list"]);

  return NextResponse.json({ ok: true, filePath });
}
