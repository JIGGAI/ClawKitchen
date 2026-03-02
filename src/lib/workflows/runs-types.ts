export type WorkflowRunNodeResultV1 = {
  nodeId: string;
  status: "pending" | "running" | "waiting" | "success" | "error" | "skipped";
  startedAt?: string;
  endedAt?: string;
  output?: unknown;
  error?: { message: string; stack?: string } | string;
};

export type WorkflowRunApprovalV1 = {
  nodeId: string;
  state: "pending" | "approved" | "changes_requested" | "canceled";
  requestedAt?: string;
  decidedAt?: string;
  /** Freeform notes from the approver (optional) */
  note?: string;
  /** Who made the decision (MVP: typically "ClawKitchen UI" or channel metadata) */
  decidedBy?: string;
  /** Outbound delivery metadata for the approval request (best-effort) */
  outbound?: {
    provider: string;
    target: string;
    sentAt?: string;
    attemptedAt?: string;
    error?: string;
  };
};

export type WorkflowRunFileV1 = {
  schema: "clawkitchen.workflow-run.v1";
  id: string;
  workflowId: string;
  teamId?: string;
  startedAt: string;
  endedAt?: string;
  status: "running" | "waiting_for_approval" | "success" | "error" | "canceled";
  /** Optional high-level summary */
  summary?: string;
  nodes?: WorkflowRunNodeResultV1[];
  approval?: WorkflowRunApprovalV1;
  meta?: Record<string, unknown>;
};
