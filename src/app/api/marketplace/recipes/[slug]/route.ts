import { NextRequest, NextResponse } from "next/server";
import { getBySlug, loadRegistry } from "@/lib/marketplace";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const registry = await loadRegistry();
    const recipe = getBySlug(registry.recipes, slug);
    if (!recipe) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true, recipe });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
