import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The runs list lives on /workflows now (same filters, sort and bulk delete); keep old links working. */
export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const team = String((Array.isArray(sp.team) ? sp.team[0] : sp.team) ?? "").trim();
  redirect(team ? `/workflows?team=${encodeURIComponent(team)}` : "/workflows");
}
