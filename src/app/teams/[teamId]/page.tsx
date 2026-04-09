import { unstable_noStore as noStore } from "next/cache";

import { getTeamDisplayName } from "@/lib/recipes";
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
  // Team pages depend on live OpenClaw state; never serve cached HTML.
  noStore();

  const { teamId } = await params;
  const sp = (await searchParams) ?? {};
  const tabRaw = sp.tab;
  const tab = Array.isArray(tabRaw) ? tabRaw[0] : tabRaw;
  const name = await getTeamDisplayName(teamId);

  return (
    <div className="flex flex-col gap-4">
      <TeamEditor teamId={teamId} teamName={name || null} initialTab={typeof tab === "string" ? tab : undefined} />
    </div>
  );
}
