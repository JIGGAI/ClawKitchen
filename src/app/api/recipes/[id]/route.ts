import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { parseFrontmatterId, resolveRecipePath, type RecipeListItem, writeRecipeFile } from "@/lib/recipes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Get list to learn the source (builtin/workspace) and metadata.
  const list = await runOpenClaw(["recipes", "list"]);
  const recipes = JSON.parse(list.stdout) as RecipeListItem[];
  const item = recipes.find((r) => r.id === id);
  if (!item) return NextResponse.json({ error: `Recipe not found: ${id}` }, { status: 404 });

  const shown = await runOpenClaw(["recipes", "show", id]);
  const filePath = await resolveRecipePath(item).catch(() => null);

  return NextResponse.json({ recipe: { ...item, content: shown.stdout, filePath }, stderr: shown.stderr });
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

  // Determine source/path via list.
  const list = await runOpenClaw(["recipes", "list"]);
  const recipes = JSON.parse(list.stdout) as RecipeListItem[];
  const item = recipes.find((r) => r.id === id);
  if (!item) return NextResponse.json({ error: `Recipe not found: ${id}` }, { status: 404 });

  const filePath = await resolveRecipePath(item);
  await writeRecipeFile(filePath, body.content);

  return NextResponse.json({ ok: true, filePath });
}
