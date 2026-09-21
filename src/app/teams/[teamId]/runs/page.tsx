import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TeamRunsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  // Runs are listed on /workflows, filtered to the team via ?team= (the sidebar selection).
  redirect(`/workflows?team=${encodeURIComponent(teamId)}`);
}
