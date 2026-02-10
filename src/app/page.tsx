import Link from "next/link";

export default function Home() {
  return (
    <main className="p-8 max-w-3xl">
      <h1 className="text-3xl font-semibold">Claw Kitchen (Phase 1)</h1>
      <p className="mt-3 text-slate-600">
        Local-first UI for authoring Clawcipes recipes and scaffolding agents/teams.
      </p>

      <div className="mt-6 flex gap-3">
        <Link
          href="/recipes"
          className="rounded bg-black text-white px-4 py-2 text-sm"
        >
          Recipes
        </Link>
      </div>
    </main>
  );
}
