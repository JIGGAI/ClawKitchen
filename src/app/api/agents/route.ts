import { NextResponse } from "next/server";
import { type AgentListItem } from "@/lib/agents";
import { errorMessage } from "@/lib/errors";
import { runOpenClaw } from "@/lib/openclaw";

export async function GET() {
  try {
    const { stdout, stderr } = await runOpenClaw(["agents", "list", "--json"]);

    const agents = JSON.parse(stdout) as AgentListItem[];

    return NextResponse.json({ agents, stderr: stderr || undefined });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to list agents",
        message: errorMessage(err),
      },
      { status: 500 },
    );
  }
}
