import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";

export async function GET() {
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

  // NOTE: We intentionally return the full list here. openclaw can return both builtin + workspace
  // entries for the same (kind,id). The UI can decide which to prefer depending on context.
  const list = Array.isArray(data) ? data : [];
  return NextResponse.json({ recipes: list, stderr });
}
