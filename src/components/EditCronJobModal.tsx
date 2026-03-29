"use client";

import { useEffect } from "react";
import { Modal } from "@/components/Modal";
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
    <Modal open={open} onClose={onClose} title="Edit Cron Job" size="lg">
      <div className="max-h-[70vh] overflow-y-auto">
        <CronJobForm formData={formData} updateField={updateField} />
        
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>
      
      <div className="flex justify-between mt-6 pt-4 border-t">
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Deleting..." : "Delete Job"}
        </button>
        
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !formData.name}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}