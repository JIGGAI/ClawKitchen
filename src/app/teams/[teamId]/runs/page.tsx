import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TeamRunsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  // Canonical route is global + team-aware:
  //   /runs?team=<teamId>
  // so the sidebar team dropdown can control the view.
  redirect(`/runs?team=${encodeURIComponent(teamId)}`);
}
