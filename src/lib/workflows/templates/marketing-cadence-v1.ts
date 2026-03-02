import type { WorkflowFileV1 } from "@/lib/workflows/types";

export function marketingCadenceWorkflowV1(opts?: { id?: string; approvalProvider?: string; approvalTarget?: string }): WorkflowFileV1 {
  const id = String(opts?.id ?? "marketing-cadence-v1").trim() || "marketing-cadence-v1";
  const approvalProvider = String(opts?.approvalProvider ?? "telegram").trim() || "telegram";
  const approvalTarget = String(opts?.approvalTarget ?? "").trim();

  return {
    schema: "clawkitchen.workflow.v1",
    id,
    name: "Marketing Cadence (v1)",
    version: 1,
    timezone: "America/New_York",
    triggers: [
      {
        kind: "cron",
        id: "t-weekdays-9",
        name: "Weekdays 09:00",
        enabled: true,
        expr: "0 9 * * 1-5",
        tz: "America/New_York",
      },
    ],
    meta: {
      templateId: "marketing-cadence-v1",
      approvalProvider,
      approvalTarget,
      writeback: {
        postLogPath: "shared-context/marketing/POST_LOG.md",
        learningsJsonlPath: "shared-context/memory/marketing_learnings.jsonl",
      },
      platforms: ["x", "instagram", "tiktok", "youtube"],
    },
    nodes: [
      { id: "start", type: "start", name: "Start", x: 60, y: 120, config: {} },
      {
        id: "research",
        type: "llm",
        name: "Research + idea",
        x: 300,
        y: 80,
        config: {
          agentId: "marketing-research",
          promptTemplate:
            "Do competitive + trend research. Produce: 5 angles + supporting bullets. Output JSON: {angles:[...], sources:[...]}" as string,
        },
      },
      {
        id: "draft_assets",
        type: "llm",
        name: "Draft platform assets",
        x: 560,
        y: 80,
        config: {
          agentId: "marketing-writer",
          promptTemplate:
            "Using the research output, draft platform-specific variants for X/Instagram/TikTok/YouTube. Output JSON: {platforms:{x:{hook,body},instagram:{hook,body,assetNotes},tiktok:{hook,script,assetNotes},youtube:{hook,script,assetNotes}}}" as string,
        },
      },
      {
        id: "qc_brand",
        type: "llm",
        name: "QC / brand consistency",
        x: 820,
        y: 80,
        config: {
          agentId: "brand-qc",
          promptTemplate:
            "Review drafts for consistency. Apply corrections. Ensure: mention ClawRecipes before OpenClaw; no posting without approval. Output JSON: {platforms:{...}, notes:[...]}" as string,
        },
      },
      {
        id: "approval",
        type: "human_approval",
        name: "Human approval",
        x: 1080,
        y: 80,
        config: {
          provider: approvalProvider,
          target: approvalTarget || "(set in UI)",
          messageTemplate:
            "{{workflow.name}} — Approval needed\nRun: {{run.id}}\n\n{{packet.note}}" as string,
        },
      },
      {
        id: "post_to_platforms",
        type: "tool",
        name: "Post (after approval)",
        x: 1340,
        y: 80,
        config: {
          tool: "marketing.post_all",
          args: {
            platforms: ["x", "instagram", "tiktok", "youtube"],
            draftsFromNode: "qc_brand",
          },
        },
      },
      {
        id: "write_post_log",
        type: "tool",
        name: "Append POST_LOG.md",
        x: 1600,
        y: 60,
        config: {
          tool: "fs.append",
          args: {
            path: "shared-context/marketing/POST_LOG.md",
            content: "- {{date}} {{platforms}} posted. Run={{run.id}}\\n" as string,
          },
        },
      },
      {
        id: "write_learnings",
        type: "tool",
        name: "Append marketing_learnings.jsonl",
        x: 1600,
        y: 140,
        config: {
          tool: "fs.append",
          args: {
            path: "shared-context/memory/marketing_learnings.jsonl",
            content:
              "{\"ts\":\"{{date}}\",\"runId\":\"{{run.id}}\",\"notes\":{{qc_brand.notes_json}}}\\n" as string,
          },
        },
      },
      { id: "end", type: "end", name: "End", x: 1860, y: 120, config: {} },
    ],
    edges: [
      { id: "e-start-research", from: "start", to: "research" },
      { id: "e-research-draft", from: "research", to: "draft_assets" },
      { id: "e-draft-qc", from: "draft_assets", to: "qc_brand" },
      { id: "e-qc-approval", from: "qc_brand", to: "approval" },
      { id: "e-approval-post", from: "approval", to: "post_to_platforms" },
      { id: "e-post-log", from: "post_to_platforms", to: "write_post_log" },
      { id: "e-post-learnings", from: "post_to_platforms", to: "write_learnings" },
      { id: "e-log-end", from: "write_post_log", to: "end" },
      { id: "e-learnings-end", from: "write_learnings", to: "end" },
    ],
  };
}
