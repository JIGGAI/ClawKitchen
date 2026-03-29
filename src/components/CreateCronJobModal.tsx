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
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>
      
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
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
          onClick={handleCreate}
          disabled={loading || !formData.name}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create Job"}
        </button>
      </div>
    </Modal>
  );
}