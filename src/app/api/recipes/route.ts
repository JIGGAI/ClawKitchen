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
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to parse openclaw recipes list output", stderr, stdout },
      { status: 500 }
    );
  }

  return NextResponse.json({ recipes: data, stderr });
}
