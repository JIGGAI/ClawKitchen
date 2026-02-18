import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";
import { goalErrorStatus, listGoals, writeGoal } from "@/lib/goals";

export async function GET() {
  try {
    const goals = await listGoals();
    return NextResponse.json({ goals });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type GoalWriteBody = {
  id: string;
  title: string;
  status?: "planned" | "active" | "done";
  tags?: string[];
  teams?: string[];
  body?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GoalWriteBody;
    const id = String(body?.id ?? "").trim();
    const title = String(body?.title ?? "").trim();
    if (!id || !title) {
      return NextResponse.json({ error: "id and title are required" }, { status: 400 });
    }

    const result = await writeGoal({
      id,
      title,
      status: body?.status,
      tags: Array.isArray(body?.tags) ? body.tags : [],
      teams: Array.isArray(body?.teams) ? body.teams : [],
      body: String(body?.body ?? ""),
    });

    return NextResponse.json({ goal: result.frontmatter });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    const status = goalErrorStatus(msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
