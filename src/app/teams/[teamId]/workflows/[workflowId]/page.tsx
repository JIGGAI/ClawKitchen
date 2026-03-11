import { unstable_noStore as noStore } from "next/cache";
import WorkflowsEditorClient from "./workflows-editor-client";
import { isPluginEnabled } from "@/lib/plugins";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkflowEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string; workflowId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  noStore();

  const { teamId, workflowId } = await params;
  const sp = (await searchParams) ?? {};
  const draftRaw = sp.draft;
  const draft = Array.isArray(draftRaw) ? draftRaw[0] : draftRaw;

  // Full-bleed workflows editor (no extra top row / padding / border).
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkflowsEditorClient
        teamId={teamId}
        workflowId={workflowId}
        draft={draft === "1"}
        llmTaskEnabled={await isPluginEnabled("llm-task")}
      />
    </div>
  );
}
