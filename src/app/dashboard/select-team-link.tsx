"use client";

import Link from "next/link";
import { selectTeam } from "@/lib/selected-team";

/** A team card link that also makes the team the sidebar's selection, so the two never disagree. */
export default function SelectTeamLink({
  teamId,
  current,
  className,
  children,
}: {
  teamId: string;
  current: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/dashboard?team=${encodeURIComponent(teamId)}`}
      onClick={() => selectTeam(teamId)}
      aria-current={current ? "true" : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}
