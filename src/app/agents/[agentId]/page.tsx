import Link from "next/link";
import AgentEditor from "./agent-editor";

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { agentId } = await params;
  const sp = (await searchParams) ?? {};
  const returnToRaw = sp.returnTo;
  const returnTo = Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw;
  const backHref = typeof returnTo === "string" && returnTo.trim() ? returnTo : "/";

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto mb-4 flex max-w-6xl items-center justify-between gap-4">
        <Link
          href={backHref}
          className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
        >
          ← Back
        </Link>
        <div className="text-xs text-[color:var(--ck-text-tertiary)]">Agent: {agentId}</div>
      </div>

      <AgentEditor agentId={agentId} returnTo={typeof returnTo === "string" ? returnTo : undefined} />
    </main>
  );
}
