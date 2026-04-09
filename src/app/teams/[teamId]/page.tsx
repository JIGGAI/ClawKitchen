import { unstable_noStore as noStore } from "next/cache";

import { readManifest } from "@/lib/manifest";
import TeamEditor from "./team-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();

  const { teamId } = await params;
  const sp = (await searchParams) ?? {};
  const tabRaw = sp.tab;
  const tab = Array.isArray(tabRaw) ? tabRaw[0] : tabRaw;

  // Fast team name lookup from manifest (avoids ~10s subprocess call)
  const manifest = await readManifest();
  const name = manifest?.teams?.[teamId]?.displayName
    ?? manifest?.recipes?.find((r) => r.kind === "team" && r.id === teamId)?.name
    ?? null;

  return (
    <div className="flex flex-col gap-4">
      <TeamEditor teamId={teamId} teamName={name} initialTab={typeof tab === "string" ? tab : undefined} />
    </div>
  );
}
