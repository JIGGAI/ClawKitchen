"use client";

import { useEffect } from "react";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { CronJobForm } from "@/components/CronJobForm";
import { useCronJobForm } from "@/hooks/useCronJobForm";
import { fetchJson } from "@/lib/fetch-json";
import { errorMessage } from "@/lib/errors";

type CronJob = {
  id: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  schedule?: {
    kind?: string;
    expr?: string;
    everyMs?: number;
    tz?: string;
  };
  delivery?: {
    mode?: string;
    channel?: string;
    to?: string;
    bestEffort?: boolean;
  };
  payload?: {
    kind?: string;
    text?: string;
    message?: string;
    model?: string;
    thinking?: string;
    timeoutSeconds?: number;
  };
  agentId?: string;
  sessionTarget?: string;
  sessionKey?: string;
};

interface EditCronJobModalProps {
  job: CronJob | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditCronJobModal({ job, open, onClose, onSaved }: EditCronJobModalProps) {
  const {
    formData,
    loading,
    error,
    setLoading,
    setError,
    updateField,
    buildPayload,
  } = useCronJobForm();

  // Populate form when job changes
  useEffect(() => {
    if (job) {
      const everyMs = job.schedule?.everyMs;
      let everyValue = 60;
      let everyUnit: "s" | "m" | "h" | "d";
      
      if (everyMs) {
        if (everyMs % 86400000 === 0) {
          everyValue = everyMs / 86400000;
          everyUnit = "d";
        } else if (everyMs % 3600000 === 0) {
          everyValue = everyMs / 3600000;
          everyUnit = "h";
        } else if (everyMs % 60000 === 0) {
          everyValue = everyMs / 60000;
          everyUnit = "m";
        } else {
          everyValue = everyMs / 1000;
          everyUnit = "s";
        }
      } else {
        everyUnit = "m";
      }

      // Update all form fields with job data
      updateField("name", job.name || "");
      updateField("description", job.description || "");
      updateField("enabled", job.enabled ?? true);
      updateField("scheduleKind", (job.schedule?.kind as "cron" | "every" | "at") || "every");
      updateField("cronExpr", job.schedule?.expr || "0 * * * *");
      updateField("everyValue", everyValue);
      updateField("everyUnit", everyUnit);
      updateField("timezone", job.schedule?.tz || "");
      updateField("deliveryMode", (job.delivery?.mode as "none" | "announce") || "none");
      updateField("deliveryChannel", job.delivery?.channel || "");
      updateField("deliveryTo", job.delivery?.to || "");
      updateField("deliveryBestEffort", job.delivery?.bestEffort ?? true);
      updateField("payloadKind", (job.payload?.kind as "systemEvent" | "agentTurn") || "agentTurn");
      updateField("payloadText", job.payload?.text || "");
      updateField("payloadMessage", job.payload?.message || "");
      updateField("payloadModel", job.payload?.model || "");
      updateField("payloadThinking", job.payload?.thinking || "");
      updateField("payloadTimeout", job.payload?.timeoutSeconds || 30);
      updateField("agentId", job.agentId || "");
      updateField("sessionTarget", job.sessionTarget || "");
      updateField("sessionKey", job.sessionKey || "");
    }
  }, [job, updateField]);

  const handleSave = async () => {
    if (!job) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await fetchJson("/api/cron/edit", {
        method: "POST",
        body: JSON.stringify({
          id: job.id,
          ...buildPayload(),
        }),
      });

      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!job || !confirm("Are you sure you want to delete this cron job?")) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await fetchJson("/api/cron/delete", {
        method: "POST",
        body: JSON.stringify({ id: job.id }),
      });

      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!job) return null;

  return (
    <ConfirmationModal
      open={open}
      onClose={onClose}
      title="Edit Cron Job"
      error={error}
      confirmLabel="Save changes"
      confirmBusyLabel="Saving…"
      confirmDisabled={!formData.name}
      busy={loading}
      onConfirm={handleSave}
    >
      <div className="mt-4 max-h-[70vh] overflow-y-auto">
        <CronJobForm formData={formData} updateField={updateField} />
      </div>

      <div className="mt-6 flex items-center justify-between gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="rounded-lg border border-[color:rgba(255,59,48,0.45)] bg-[color:rgba(255,59,48,0.08)] px-3 py-2 text-sm font-medium text-[color:var(--ck-accent-red)] transition-colors hover:bg-[color:rgba(255,59,48,0.12)] disabled:opacity-50"
        >
          Delete job
        </button>
        <div className="text-xs text-[color:var(--ck-text-tertiary)]">Tip: use dryRun=true to test safely.</div>
      </div>
    </ConfirmationModal>
  );
}
