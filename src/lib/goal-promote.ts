import { slugifyId } from "./slugify";

/** Slugify for file path parts (max 80 chars). */
export function slugifyFilePart(input: string): string {
  return slugifyId(input, 80);
}

const WORKFLOW_MARKER = "<!-- goal-workflow -->";

export function ensureWorkflowInstructions(body: string): string {
  if (body.includes(WORKFLOW_MARKER)) return body;
  const snippet = [
    "",
    "## Workflow",
    WORKFLOW_MARKER,
    "- Use **Promote to inbox** to send this goal to the development-team inbox for scoping.",
    "- When promoted, set goal status to **active**.",
    "- Track implementation work via tickets (add links/IDs under a **Tickets** section in this goal).",
    "- When development is complete (all associated tickets marked done), set goal status to **done**.",
    "",
    "## Tickets",
    "- (add ticket links/ids)",
    "",
  ].join("\n");

  return (body ?? "").trim() + snippet;
}
