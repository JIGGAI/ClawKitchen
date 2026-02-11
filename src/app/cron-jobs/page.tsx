import CronJobsClient from "./cron-jobs-client";
import Link from "next/link";

export default function CronJobsPage() {
  return (
    <main className="min-h-screen p-8">
      <div className="ck-glass mx-auto max-w-5xl p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Cron Jobs (recipe-installed)</h1>
          <div className="flex gap-3">
            <Link
              href="/settings"
              className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
            >
              Settings
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-[color:var(--ck-text-secondary)] transition-colors hover:text-[color:var(--ck-text-primary)]"
            >
              Home
            </Link>
          </div>
        </div>
        <p className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
          This page only shows cron jobs installed by recipes (based on the scaffold mapping file
          <code className="ml-1">notes/cron-jobs.json</code> in the team workspace).
        </p>

        <div className="mt-6">
          <CronJobsClient />
        </div>
      </div>
    </main>
  );
}
