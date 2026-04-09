"use client";

import Image from "next/image";
import { isImageFile, isVideoFile, isAudioFile, mimeForFile } from "@/lib/media-file-utils";

export interface PreviewableDeliverable {
  fileName: string;
  size: number;
  mtime: string;
  relativePath: string;
  runId: string;
  isText?: boolean;
  contentPreview?: string;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(mtime: string) {
  try {
    return new Date(mtime).toLocaleString();
  } catch {
    return mtime;
  }
}

function getFileIcon(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const icons: Record<string, string> = {
    png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", webp: "🖼️", svg: "🖼️",
    mp4: "🎬", webm: "🎬", mov: "🎬", avi: "🎬", mkv: "🎬", ogv: "🎬",
    mp3: "🎵", wav: "🎵", ogg: "🎵", m4a: "🎵", aac: "🎵", flac: "🎵",
    json: "📋", md: "📝", txt: "📄", html: "🌐", pdf: "📕",
  };
  return icons[ext] ?? "📎";
}

interface DeliverablePreviewPanelProps {
  deliverable: PreviewableDeliverable | null;
  fileUrl: string;
  /** Max height for image/video, e.g. "300px" or "500px" */
  maxMediaHeight?: string;
  onDownload: () => void;
}

export function DeliverablePreviewPanel({
  deliverable,
  fileUrl,
  maxMediaHeight = "400px",
  onDownload,
}: DeliverablePreviewPanelProps) {
  if (!deliverable) {
    return (
      <div className="text-sm text-[color:var(--ck-text-secondary)] italic">
        Select a deliverable to preview
      </div>
    );
  }

  return (
    <div>
      {/* File info header */}
      <div className="mb-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{getFileIcon(deliverable.fileName)}</span>
          <span className="font-medium text-[color:var(--ck-text-primary)] text-sm break-all">
            {deliverable.fileName}
          </span>
        </div>
        <div className="text-xs text-[color:var(--ck-text-tertiary)] space-y-1">
          <div>Size: {formatBytes(deliverable.size)}</div>
          <div>Modified: {formatDate(deliverable.mtime)}</div>
          <div>Path: {deliverable.relativePath}</div>
        </div>
      </div>

      {/* Media preview */}
      {isImageFile(deliverable.fileName) ? (
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)] mb-2">Image Preview:</div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-2 overflow-hidden">
            <Image
              src={fileUrl}
              alt={deliverable.fileName}
              width={800}
              height={600}
              className="w-full h-auto rounded-lg object-contain"
              style={{ maxHeight: maxMediaHeight }}
              unoptimized
            />
          </div>
          <div className="mt-2 flex gap-2">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 border border-white/10 rounded hover:bg-white/5 text-[color:var(--ck-text-secondary)]"
            >
              Open full size ↗
            </a>
            <button
              onClick={onDownload}
              className="text-xs px-2 py-1 border border-white/10 rounded hover:bg-white/5 text-[color:var(--ck-text-secondary)]"
            >
              Download
            </button>
          </div>
        </div>
      ) : isVideoFile(deliverable.fileName) ? (
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)] mb-2">Video Preview:</div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-2 overflow-hidden">
            <video
              src={fileUrl}
              controls
              className="w-full rounded-lg"
              style={{ maxHeight: maxMediaHeight }}
              preload="metadata"
            >
              <source src={fileUrl} type={mimeForFile(deliverable.fileName)} />
              Your browser does not support video playback.
            </video>
          </div>
          <div className="mt-2 flex gap-2">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 border border-white/10 rounded hover:bg-white/5 text-[color:var(--ck-text-secondary)]"
            >
              Open full size ↗
            </a>
            <button
              onClick={onDownload}
              className="text-xs px-2 py-1 border border-white/10 rounded hover:bg-white/5 text-[color:var(--ck-text-secondary)]"
            >
              Download
            </button>
          </div>
        </div>
      ) : isAudioFile(deliverable.fileName) ? (
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)] mb-2">Audio Preview:</div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">
            <audio
              src={fileUrl}
              controls
              className="w-full"
              preload="metadata"
            >
              <source src={fileUrl} type={mimeForFile(deliverable.fileName)} />
              Your browser does not support audio playback.
            </audio>
          </div>
          <div className="mt-2">
            <button
              onClick={onDownload}
              className="text-xs px-2 py-1 border border-white/10 rounded hover:bg-white/5 text-[color:var(--ck-text-secondary)]"
            >
              Download
            </button>
          </div>
        </div>
      ) : deliverable.isText && deliverable.contentPreview ? (
        <div>
          <div className="text-xs text-[color:var(--ck-text-tertiary)] mb-2">Content Preview:</div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 overflow-auto" style={{ maxHeight: maxMediaHeight }}>
            <pre className="text-xs text-[color:var(--ck-text-primary)] whitespace-pre-wrap break-words">
              {deliverable.contentPreview}
            </pre>
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="text-3xl mb-2">{getFileIcon(deliverable.fileName)}</div>
          <div className="text-xs text-[color:var(--ck-text-secondary)] mb-2">
            {formatBytes(deliverable.size)} · {deliverable.fileName.split(".").pop()?.toUpperCase()} file
          </div>
          <button
            onClick={onDownload}
            className="text-xs px-3 py-1.5 border border-white/10 rounded hover:bg-white/5 text-[color:var(--ck-text-secondary)]"
          >
            Download file
          </button>
        </div>
      )}
    </div>
  );
}
