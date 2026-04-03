/**
 * Shared media file detection and MIME helpers for deliverables preview.
 */

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi", "mkv", "ogv"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "webm"]);

function extOf(fileName: string): string {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

export function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(extOf(fileName));
}

export function isVideoFile(fileName: string): boolean {
  return VIDEO_EXTENSIONS.has(extOf(fileName));
}

export function isAudioFile(fileName: string): boolean {
  return AUDIO_EXTENSIONS.has(extOf(fileName));
}

const MIME_MAP: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska", ogv: "video/ogg",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
};

export function mimeForFile(fileName: string): string {
  return MIME_MAP[extOf(fileName)] ?? "";
}
