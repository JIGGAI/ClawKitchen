"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

import type { WorkflowDeliverable, WorkflowDeliverablesResponse } from "@/app/api/teams/workflow-deliverables/route";
import { isImageFile } from "@/lib/media-file-utils";
import { DeliverablePreviewPanel } from "@/components/DeliverablePreviewPanel";

function deliverableFileUrl(teamId: string, d: WorkflowDeliverable): string {
  return `/api/teams/workflow-deliverables/file?teamId=${encodeURIComponent(teamId)}&runId=${encodeURIComponent(d.runId)}&path=${encodeURIComponent(d.relativePath)}`;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return dateString;
  }
}

function getFileIcon(fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "md":
      return "📝";
    case "json":
      return "🔧";
    case "txt":
      return "📄";
    case "html":
    case "htm":
      return "🌐";
    case "css":
      return "🎨";
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
      return "⚙️";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
      return "🖼️";
    case "pdf":
      return "📋";
    case "zip":
    case "tar":
    case "gz":
      return "📦";
    default:
      return "📄";
  }
}

export default function RunDeliverables({
  teamId,
  workflowId,
  runId,
  isActive = false,
}: {
  teamId: string;
  workflowId: string;
  runId: string;
  isActive?: boolean;
}) {
  const [deliverables, setDeliverables] = useState<WorkflowDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedDeliverable, setSelectedDeliverable] = useState<WorkflowDeliverable | null>(null);
  const initialLoadDone = useRef(false);

  const filteredDeliverables = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return deliverables.filter((d) => {
      if (!needle) return true;

      return (
        d.fileName.toLowerCase().includes(needle) ||
        (d.contentPreview && d.contentPreview.toLowerCase().includes(needle))
      );
    });
  }, [deliverables, searchQuery]);

  const fetchDeliverables = useCallback(async (showLoading: boolean) => {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const response = await fetchJson<WorkflowDeliverablesResponse>(
        `/api/teams/workflow-deliverables?teamId=${encodeURIComponent(teamId)}&workflowId=${encodeURIComponent(workflowId)}&runId=${encodeURIComponent(runId)}`
      );

      if (!response.ok) {
        throw new Error("error" in response ? String(response.error) : "Failed to fetch deliverables");
      }

      setDeliverables(response.deliverables);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [teamId, workflowId, runId]);

  // Initial fetch
  useEffect(() => {
    initialLoadDone.current = false;
    fetchDeliverables(true).then(() => { initialLoadDone.current = true; });
  }, [fetchDeliverables]);

  // Poll while the run is active
  useEffect(() => {
    if (!isActive || !initialLoadDone.current) return;
    const id = setInterval(() => fetchDeliverables(false), 15_000);
    return () => clearInterval(id);
  }, [isActive, fetchDeliverables]);

  const downloadDeliverable = async (deliverable: WorkflowDeliverable) => {
    try {
      if (deliverable.isText && deliverable.contentPreview) {
        await navigator.clipboard.writeText(deliverable.contentPreview);
        alert("Content copied to clipboard!");
      } else {
        // Download binary files via the file API
        const url = deliverableFileUrl(teamId, deliverable);
        const a = document.createElement("a");
        a.href = url;
        a.download = deliverable.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      alert("Failed to download file");
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
        <h2 className="text-lg font-semibold text-[color:var(--ck-text-primary)] mb-4">
          Run Deliverables
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="text-center text-[color:var(--ck-text-secondary)]">
            <div className="text-2xl mb-2">⏳</div>
            <div>Loading deliverables...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
        <h2 className="text-lg font-semibold text-[color:var(--ck-text-primary)] mb-4">
          Run Deliverables
        </h2>
        <div className="text-center py-8 text-red-400">
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-sm">Failed to load deliverables: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[color:var(--ck-text-primary)]">
          Run Deliverables
        </h2>
        
        {deliverables.length > 0 && (
          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">search</div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="filename / content"
              className="mt-1 w-64 max-w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
            />
          </label>
        )}
      </div>

      {filteredDeliverables.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Deliverables List */}
          <div className="lg:col-span-2">
            <div className="space-y-2">
              {filteredDeliverables.map((deliverable, idx) => {
                const isSelected = selectedDeliverable?.absolutePath === deliverable.absolutePath;
                
                return (
                  <div
                    key={`${deliverable.runId}-${deliverable.relativePath}`}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? "border-white/20 bg-white/10"
                        : "border-white/5 bg-black/5 hover:bg-white/5"
                    }`}
                    onClick={() => setSelectedDeliverable(deliverable)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {isImageFile(deliverable.fileName) && (
                        <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-white/5 border border-white/10">
                          <Image
                            src={deliverableFileUrl(teamId, deliverable)}
                            alt={deliverable.fileName}
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getFileIcon(deliverable.fileName)}</span>
                          <span className="font-medium text-[color:var(--ck-text-primary)] truncate">
                            {deliverable.fileName}
                          </span>
                          {deliverable.isText && (
                            <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                              TEXT
                            </span>
                          )}
                        </div>
                        
                        <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
                          {deliverable.relativePath !== deliverable.fileName && (
                            <span>{deliverable.relativePath} · </span>
                          )}
                          {formatBytes(deliverable.size)} · {formatDate(deliverable.mtime)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadDeliverable(deliverable);
                          }}
                          className="text-xs px-2 py-1 border border-white/10 rounded hover:bg-white/5 text-[color:var(--ck-text-secondary)]"
                        >
                          {deliverable.isText ? "Copy" : "Download"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {filteredDeliverables.length > 0 && deliverables.length !== filteredDeliverables.length && (
              <div className="mt-4 text-xs text-[color:var(--ck-text-tertiary)]">
                Showing {filteredDeliverables.length} of {deliverables.length} deliverables.
              </div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-1">
            <div className="rounded-lg border border-white/10 bg-black/10 p-4">
              <h3 className="text-sm font-semibold text-[color:var(--ck-text-primary)] mb-3">
                Preview
              </h3>

              <DeliverablePreviewPanel
                deliverable={selectedDeliverable}
                fileUrl={selectedDeliverable ? deliverableFileUrl(teamId, selectedDeliverable) : ""}
                maxMediaHeight="300px"
                onDownload={() => selectedDeliverable && downloadDeliverable(selectedDeliverable)}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-[color:var(--ck-text-secondary)]">
          <div className="text-4xl mb-2">📋</div>
          <div className="text-lg mb-1">No deliverables found</div>
          <div className="text-sm">
            This workflow run has not generated any deliverable files yet.
          </div>
        </div>
      )}
    </div>
  );
}