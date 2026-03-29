import { useState } from "react";

export interface CronJobFormData {
  name: string;
  description: string;
  enabled: boolean;
  scheduleKind: "cron" | "every" | "at";
  cronExpr: string;
  everyValue: number;
  everyUnit: "s" | "m" | "h" | "d";
  atValue: string;
  timezone: string;
  deliveryMode: "none" | "announce";
  deliveryChannel: string;
  deliveryTo: string;
  deliveryBestEffort: boolean;
  payloadKind: "systemEvent" | "agentTurn";
  payloadText: string;
  payloadMessage: string;
  payloadModel: string;
  payloadThinking: string;
  payloadTimeout: number;
  agentId: string;
  sessionTarget: string;
  sessionKey: string;
}

export interface UseCronJobFormOptions {
  initialData?: Partial<CronJobFormData>;
}

export function useCronJobForm(options: UseCronJobFormOptions = {}) {
  const [formData, setFormData] = useState<CronJobFormData>({
    name: "",
    description: "",
    enabled: true,
    scheduleKind: "every",
    cronExpr: "0 * * * *",
    everyValue: 60,
    everyUnit: "m",
    atValue: "",
    timezone: "",
    deliveryMode: "none",
    deliveryChannel: "",
    deliveryTo: "",
    deliveryBestEffort: true,
    payloadKind: "agentTurn",
    payloadText: "",
    payloadMessage: "",
    payloadModel: "",
    payloadThinking: "",
    payloadTimeout: 30,
    agentId: "",
    sessionTarget: "",
    sessionKey: "",
    ...options.initialData,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = <K extends keyof CronJobFormData>(
    field: K,
    value: CronJobFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const reset = () => {
    setFormData({
      name: "",
      description: "",
      enabled: true,
      scheduleKind: "every",
      cronExpr: "0 * * * *",
      everyValue: 60,
      everyUnit: "m",
      atValue: "",
      timezone: "",
      deliveryMode: "none",
      deliveryChannel: "",
      deliveryTo: "",
      deliveryBestEffort: true,
      payloadKind: "agentTurn",
      payloadText: "",
      payloadMessage: "",
      payloadModel: "",
      payloadThinking: "",
      payloadTimeout: 30,
      agentId: "",
      sessionTarget: "",
      sessionKey: "",
      ...options.initialData,
    });
  };

  const buildPayload = () => {
    const everyMs = formData.scheduleKind === "every" ? 
      formData.everyValue * (
        formData.everyUnit === "s" ? 1000 : 
        formData.everyUnit === "m" ? 60000 : 
        formData.everyUnit === "h" ? 3600000 : 
        86400000
      ) : undefined;

    const schedule = formData.scheduleKind === "cron" 
      ? { kind: "cron" as const, expr: formData.cronExpr, ...(formData.timezone ? { tz: formData.timezone } : {}) }
      : formData.scheduleKind === "every"
      ? { kind: "every" as const, everyMs: everyMs! }
      : { kind: "at" as const, at: formData.atValue };

    const delivery = formData.deliveryMode === "none" 
      ? { mode: "none" as const }
      : { 
          mode: "announce" as const, 
          ...(formData.deliveryChannel ? { channel: formData.deliveryChannel } : {}),
          ...(formData.deliveryTo ? { to: formData.deliveryTo } : {}),
          bestEffort: formData.deliveryBestEffort 
        };

    const payload = formData.payloadKind === "systemEvent"
      ? { kind: "systemEvent" as const, text: formData.payloadText }
      : { 
          kind: "agentTurn" as const, 
          message: formData.payloadMessage,
          ...(formData.payloadModel ? { model: formData.payloadModel } : {}),
          ...(formData.payloadThinking ? { thinking: formData.payloadThinking } : {}),
          timeoutSeconds: formData.payloadTimeout 
        };

    return {
      name: formData.name,
      description: formData.description,
      enabled: formData.enabled,
      schedule,
      delivery,
      payload,
      agentId: formData.agentId,
      sessionTarget: formData.sessionTarget,
      sessionKey: formData.sessionKey,
    };
  };

  return {
    formData,
    loading,
    error,
    setLoading,
    setError,
    updateField,
    reset,
    buildPayload,
  };
}