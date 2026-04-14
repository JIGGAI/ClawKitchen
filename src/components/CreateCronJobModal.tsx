"use client";

import { Modal } from "@/components/Modal";
import { CronJobForm } from "@/components/CronJobForm";
import { useCronJobForm } from "@/hooks/useCronJobForm";
import { fetchJson } from "@/lib/fetch-json";
import { errorMessage } from "@/lib/errors";

interface CreateCronJobModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateCronJobModal({ open, onClose, onCreated }: CreateCronJobModalProps) {
  const {
    formData,
    loading,
    error,
    setLoading,
    setError,
    updateField,
    reset,
    buildPayload,
  } = useCronJobForm();

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await fetchJson("/api/cron/add", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });

      onCreated();
      onClose();
      reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Cron Job" size="lg">
      <div className="max-h-[70vh] overflow-y-auto">
        <CronJobForm formData={formData} updateField={updateField} />

        {error && (
          <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || !formData.name}
          className="rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] transition-colors hover:bg-[var(--ck-accent-red-hover)] disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Job"}
        </button>
      </div>
    </Modal>
  );
}