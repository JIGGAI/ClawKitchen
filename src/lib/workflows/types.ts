export type WorkflowTriggerCronV1 = {
  kind: "cron";
  id: string;
  name?: string;
  enabled?: boolean;
  /** Standard 5-field cron expression */
  expr: string;
  /** IANA timezone, e.g. America/New_York */
  tz?: string;
};



export type WorkflowNodeV1 = {
  id: string;
  type:
    | "start"
    | "end"
    | "llm"
    | "tool"
    | "condition"
    | "delay"
    | "human_approval"
    | "media-image"
    | "media-video";
  name?: string;
  /** UI layout hints (optional) */
  x?: number;
  y?: number;
  /** Node-type-specific config */
  config?: Record<string, unknown>;
};

export type WorkflowEdgeV1 = {
  id: string;
  from: string;
  to: string;
  /** Optional edge label/condition */
  label?: string;
};

export type WorkflowFileV1 = {
  schema: "clawkitchen.workflow.v1";
  id: string;
  name: string;
  version?: number;
  timezone?: string;
  triggers?: WorkflowTriggerCronV1[];
  nodes: WorkflowNodeV1[];
  edges: WorkflowEdgeV1[];
  meta?: Record<string, unknown>;
};
