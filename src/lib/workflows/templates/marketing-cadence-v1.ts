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
      approvalBindingId: "marketing-approval",
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
            "Do competitive + trend research. Produce: 5 angles + supporting bullets. Output JSON: {angles:[...], sources:[...]}",
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
            "Using the research output, draft platform-specific variants applying proven viral psychology:\n\n**EMOTIONAL TRIGGER (REQUIRED):** Every post must trigger one of these emotions:\n- NSFW (\"That's crazy!\") - shocking/surprising\n- LOL (\"That's funny!\") - humor/entertainment\n- OHHH (\"Now I get it!\") - aha moments/simplification\n- WOW (\"That's amazing!\") - success stories\n- FINALLY (\"Someone said it!\") - validating opinions\n- WTF (\"That pisses me off!\") - frustration with status quo\n\n**IDENTITY TARGETING:** Use 'There are two types of...' or 'This is for founders who...'\n**US vs THEM:** Position against inefficient alternatives (not competitors)\n\nState which emotion you're targeting and why.\n\nAlso include an `image_brief` field: a concise (under 1000 chars) visual concept description for DALL-E image generation. Describe the scene, composition, color palette, and mood — NO text/words in the image. This should capture the emotional hook visually without repeating the copy.\n\nOutput JSON: {emotion:'OHHH',image_brief:'A split-screen illustration showing...',platforms:{x:{hook,body},instagram:{hook,body,assetNotes},tiktok:{hook,script,assetNotes},youtube:{hook,script,assetNotes}}}",
        },
      },
      {
        id: "generate_image",
        type: "media-image",
        name: "Design image concept",
        x: 670,
        y: 320,
        config: {
          mediaType: "image",
          provider: "skill-openai-image-gen",
          prompt: "{{draft_assets.image_brief}}",
          promptTemplate: "{{draft_assets.image_brief}}",
          outputPath: "node-outputs/generated_image.png",
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
            "Review drafts for consistency and note the image concept for visual alignment. Apply corrections. Always mention @ClawRecipes and how it applies to the post. Remove any hashtags if present.\n\nImage concept from designer:\n{{generate_image.output}}\n\nEnsure the copy and visual concept work together effectively. No posting without approval. Output JSON: {platforms:{...}, image_concept: \"brief description of planned visual\", notes:[...]}",
        },
      },
      {
        id: "post_preview",
        type: "tool",
        name: "Post preview (dry run)",
        x: 1080,
        y: 220,
        config: {
          tool: "marketing.post_all",
          args: {
            platforms: ["x", "instagram", "tiktok", "youtube"],
            draftsFromNode: "qc_brand",
            dryRun: true,
          },
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
            "{{workflow.name}} — Approval needed\nRun: {{run.id}}\n\n{{packet.note}}",
          approvalBindingId: "marketing-approval",
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
            content: "- {{date}} {{platforms}} posted. Run={{run.id}}\\n",
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
              '{"ts":"{{date}}","runId":"{{run.id}}","notes":{{qc_brand.notes_json}}}\\n',
          },
        },
      },
      {
        id: "update_ticket",
        type: "llm",
        name: "Update ticket with details",
        x: 1860,
        y: 100,
        config: {
          promptTemplate:
            "A marketing cadence workflow run just completed. Update the associated ticket with all run details.\n\nWorkflow: {{workflow.name}}\nRun ID: {{run.id}}\nDate: {{date}}\n\nResearch output:\n{{research.output}}\n\nDraft assets:\n{{draft_assets.output}}\n\nGenerated image:\n{{generate_image.output}}\n\nQC/Brand review:\n{{qc_brand.output}}\n\nPosting results:\n{{post_to_platforms.output}}\n\nWrite a clear, dated summary under ## Comments in the ticket capturing:\n- What was researched and which angle was chosen\n- What image was generated and its visual concept\n- What platforms were posted to\n- The final approved copy and image\n- Any QC notes or corrections made\n- Links to posted content if available\n\nThen move the ticket to work/done/.",
        },
      },
      { id: "end", type: "end", name: "End", x: 2120, y: 120, config: {} },
    ],
    edges: [
      { id: "e-start-research", from: "start", to: "research" },
      { id: "e-research-draft", from: "research", to: "draft_assets" },
      { id: "e-draft-image", from: "draft_assets", to: "generate_image" },
      { id: "e-image-qc", from: "generate_image", to: "qc_brand" },
      { id: "e-qc-preview", from: "qc_brand", to: "post_preview" },
      { id: "e-preview-approval", from: "post_preview", to: "approval" },
      { id: "e-approval-post", from: "approval", to: "post_to_platforms" },
      { id: "e-post-log", from: "post_to_platforms", to: "write_post_log" },
      { id: "e-post-learnings", from: "post_to_platforms", to: "write_learnings" },
      { id: "e-log-ticket", from: "write_post_log", to: "update_ticket" },
      { id: "e-learnings-ticket", from: "write_learnings", to: "update_ticket" },
      { id: "e-ticket-end", from: "update_ticket", to: "end" },
    ],
  };
}
