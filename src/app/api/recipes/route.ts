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

  const list = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];

  // openclaw can return multiple entries for the same id/kind (e.g. builtin + workspace override).
  // For UI operations, we want a single canonical entry per (kind,id), preferring `workspace`.
  const deduped = Array.from(
    list.reduce((acc, r) => {
      const id = String(r.id ?? "");
      const kind = String(r.kind ?? "");
      const source = String(r.source ?? "");
      const key = `${kind}:${id}`;

      const prev = acc.get(key);
      if (!prev) {
        acc.set(key, r);
        return acc;
      }

      const prevSource = String(prev.source ?? "");
      // prefer workspace over builtin
      if (prevSource !== "workspace" && source === "workspace") {
        acc.set(key, r);
      }

      return acc;
    }, new Map<string, Record<string, unknown>>()),
  ).map(([, v]) => v);

  return NextResponse.json({ recipes: deduped, stderr });
}
