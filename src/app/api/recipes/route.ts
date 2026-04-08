import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";
import { readManifest } from "@/lib/manifest";

export async function GET() {
  // Fast path: read from manifest
  const manifest = await readManifest();
  if (manifest?.recipes?.length) {
    return NextResponse.json({ recipes: manifest.recipes, stderr: "" });
  }

  // Fallback: subprocess call
  const { stdout, stderr } = await runOpenClaw(["recipes", "list"]);
  if (stderr.trim()) {
    // non-fatal warnings go to stderr sometimes; still try to parse stdout.
  }

  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return NextResponse.json({ error: "Failed to parse openclaw recipes list output", stderr, stdout }, { status: 500 });
  }

  const list = Array.isArray(data) ? data : [];
  return NextResponse.json({ recipes: list, stderr });
}
