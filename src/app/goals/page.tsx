import { Suspense } from "react";
import GoalsClient from "./goals-client";

export default function GoalsPage() {
  return (
    <Suspense fallback={<div className="ck-card p-6 text-sm text-[color:var(--ck-text-secondary)]">Loading goals…</div>}>
      <GoalsClient />
    </Suspense>
  );
}
