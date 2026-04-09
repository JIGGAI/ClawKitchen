"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { WorkflowDeliverable } from "@/app/api/teams/workflow-deliverables/route";
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

export default function DeliverablesClient({
  teamId,
  deliverables,
  workflows,
}: {
  teamId: string;
  deliverables: WorkflowDeliverable[];
  workflows: Record<string, { id: string; name?: string }>;
}) {
  const router = useRouter();
  const [workflowFilter, setWorkflowFilter] = useState<string>("");
  const [runFilter, setRunFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedDeliverable, setSelectedDeliverable] = useState<WorkflowDeliverable | null>(null);

  const filteredDeliverables = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return deliverables.filter((d) => {
      if (workflowFilter && d.workflowId !== workflowFilter) return false;
      if (runFilter && d.runId !== runFilter) return false;
      if (!needle) return true;
      
      const wfName = workflows[d.workflowId]?.name ?? "";
      return (
        d.fileName.toLowerCase().includes(needle) ||
        d.workflowId.toLowerCase().includes(needle) ||
        d.runId.toLowerCase().includes(needle) ||
        wfName.toLowerCase().includes(needle) ||
        (d.contentPreview && d.contentPreview.toLowerCase().includes(needle))
      );
    });
  }, [deliverables, searchQuery, workflowFilter, runFilter, workflows]);

  const workflowOptions = useMemo(() => {
    const ids = Array.from(new Set(deliverables.map((d) => d.workflowId).filter(Boolean))).sort();
    return ids;
  }, [deliverables]);

  const runOptions = useMemo(() => {
    const filtered = workflowFilter 
      ? deliverables.filter(d => d.workflowId === workflowFilter)
      : deliverables;
    const ids = Array.from(new Set(filtered.map((d) => d.runId).filter(Boolean))).sort();
    return ids;
  }, [deliverables, workflowFilter]);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">workflow</div>
              <select
                value={workflowFilter}
                onChange={(e) => {
                  setWorkflowFilter(e.target.value || "");
                  setRunFilter(""); // Reset run filter when workflow changes
                }}
                className="mt-1 w-64 max-w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
              >
                <option value="">All workflows</option>
                {workflowOptions.map((id) => (
                  <option key={id} value={id}>
                    {workflows[id]?.name ? `${workflows[id]?.name} (${id})` : id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">run</div>
              <select
                value={runFilter}
                onChange={(e) => setRunFilter(e.target.value || "")}
                className="mt-1 w-56 max-w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
              >
                <option value="">All runs</option>
                {runOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">search</div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="filename / content"
                className="mt-1 w-72 max-w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm text-[color:var(--ck-text-primary)]"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Deliverables List */}
        <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-black/10 p-4">
          <h2 className="text-lg font-semibold text-[color:var(--ck-text-primary)] mb-4">
            Workflow Deliverables
          </h2>

          {filteredDeliverables.length > 0 ? (
            <div className="space-y-2">
              {filteredDeliverables.map((deliverable, idx) => {
                const isSelected = selectedDeliverable?.absolutePath === deliverable.absolutePath;
                const wfName = workflows[deliverable.workflowId]?.name || deliverable.workflowId;
                
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
                          <span className="font-mono">{wfName}</span>
                          {" · "}
                          <span className="font-mono">{deliverable.runId}</span>
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
                        <Link
                          href={`/teams/${teamId}/runs/${deliverable.workflowId}/${deliverable.runId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs px-2 py-1 border border-white/10 rounded hover:bg-white/5 text-[color:var(--ck-text-secondary)]"
                        >
                          View Run →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-[color:var(--ck-text-secondary)]">
              <div className="text-4xl mb-2">📋</div>
              <div className="text-lg mb-1">No deliverables found</div>
              <div className="text-sm">
                Workflow runs will create deliverables that appear here when they complete.
              </div>
            </div>
          )}

          {filteredDeliverables.length > 0 && (
            <div className="mt-4 text-xs text-[color:var(--ck-text-tertiary)]">
              Showing {filteredDeliverables.length} of {deliverables.length} deliverables.
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-1 rounded-3xl border border-white/10 bg-black/10 p-4">
          <h3 className="text-sm font-semibold text-[color:var(--ck-text-primary)] mb-3">
            Preview
          </h3>

          {selectedDeliverable ? (
            <div>
              <div className="mb-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{getFileIcon(selectedDeliverable.fileName)}</span>
                  <span className="font-medium text-[color:var(--ck-text-primary)] text-sm break-all">
                    {selectedDeliverable.fileName}
                  </span>
                </div>
                <div className="text-xs text-[color:var(--ck-text-tertiary)] space-y-1">
                  <div>Size: {formatBytes(selectedDeliverable.size)}</div>
                  <div>Modified: {formatDate(selectedDeliverable.mtime)}</div>
                  <div>Path: {selectedDeliverable.relativePath}</div>
                </div>
              </div>

              <DeliverablePreviewPanel
                deliverable={selectedDeliverable}
                fileUrl={deliverableFileUrl(teamId, selectedDeliverable)}
                maxMediaHeight="500px"
                onDownload={() => downloadDeliverable(selectedDeliverable)}
              />
            </div>
          ) : (
            <div className="text-sm text-[color:var(--ck-text-secondary)] italic">
              Select a deliverable to preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}