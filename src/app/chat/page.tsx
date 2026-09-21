import { unstable_noStore as noStore } from "next/cache";
import { readManifest } from "@/lib/manifest";
import ChatClient, { type ChatAgent } from "./chat-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function first(v: string | string[] | undefined): string {
  return String((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

function teamOf(workspace: string | undefined): string | null {
  const m = /\/workspace-([^/]+)(?:\/|$)/.exec(workspace ?? "");
  return m ? m[1] : null;
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();
  const sp = await searchParams;
  const manifest = await readManifest();
  const recipeNames = new Map((manifest?.recipes ?? []).filter((r) => r.kind === "team").map((r) => [r.id, r.name]));
  const agents: ChatAgent[] = (manifest?.agents ?? []).map((a) => {
    const team = teamOf(a.workspace);
    return {
      id: a.id,
      name: a.identityName ?? a.id,
      team,
      teamName: team ? (manifest?.teams[team]?.displayName ?? recipeNames.get(team) ?? team) : null,
      isDefault: a.isDefault === true,
    };
  });

  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-[32rem] flex-col">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
          Talk to any agent in its own OpenClaw sessions — the same threads the Control UI shows.
        </p>
      </div>
      <ChatClient agents={agents} initialAgent={first(sp.agent)} initialThread={first(sp.thread)} />
    </div>
  );
}
