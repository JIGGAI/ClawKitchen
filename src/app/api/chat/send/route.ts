import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { gatewayRequest } from "@/lib/chat/gateway-client";
import { isChatSessionKey } from "@/lib/chat/messages";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 100_000;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const SEND_TIMEOUT_MS = 60_000;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type IncomingAttachment = {
  type?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
  origin?: unknown;
  content?: unknown;
};

type ChatAttachment = {
  type: "image";
  mimeType: string;
  fileName?: string;
  origin?: "paste" | "file";
  content: string;
};

function decodedSize(content: string): number {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}

function parseAttachments(value: unknown): { attachments: ChatAttachment[]; error?: string } {
  if (value === undefined) return { attachments: [] };
  if (!Array.isArray(value)) return { attachments: [], error: "attachments must be an array" };
  if (value.length > MAX_ATTACHMENTS) {
    return { attachments: [], error: `Attach at most ${MAX_ATTACHMENTS} images` };
  }

  let totalBytes = 0;
  const attachments: ChatAttachment[] = [];
  for (const raw of value) {
    const item = raw && typeof raw === "object" ? (raw as IncomingAttachment) : null;
    const mimeType = typeof item?.mimeType === "string" ? item.mimeType.toLowerCase() : "";
    const content = typeof item?.content === "string" ? item.content : "";
    if (item?.type !== "image" || !IMAGE_MIME_TYPES.has(mimeType)) {
      return { attachments: [], error: "Only PNG, JPEG, WebP, GIF, and AVIF images are supported" };
    }
    if (!content || content.length % 4 !== 0 || !BASE64_RE.test(content)) {
      return { attachments: [], error: "An image has invalid base64 content" };
    }
    const size = decodedSize(content);
    if (size > MAX_ATTACHMENT_BYTES) {
      return { attachments: [], error: "Each image must be 8 MB or smaller" };
    }
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return { attachments: [], error: "Attached images must total 20 MB or less" };
    }
    const fileName =
      typeof item.fileName === "string" && item.fileName.trim()
        ? item.fileName.trim().slice(0, 255)
        : undefined;
    const origin = item.origin === "paste" || item.origin === "file" ? item.origin : undefined;
    attachments.push({
      type: "image",
      mimeType,
      content,
      ...(fileName ? { fileName } : {}),
      ...(origin ? { origin } : {}),
    });
  }
  return { attachments };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { session?: unknown; message?: unknown; attachments?: unknown }
    | null;
  const session = typeof body?.session === "string" ? body.session : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const parsed = parseAttachments(body?.attachments);
  if (!isChatSessionKey(session)) {
    return NextResponse.json({ ok: false, error: "Not a chat thread" }, { status: 400 });
  }
  if (parsed.error) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  if (!message && parsed.attachments.length === 0) {
    return NextResponse.json({ ok: false, error: "message or attachment is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ ok: false, error: "message is too long" }, { status: 400 });
  }
  try {
    const out = await gatewayRequest<{ runId?: unknown; status?: unknown }>(
      "chat.send",
      {
        sessionKey: session,
        message,
        idempotencyKey: randomUUID(),
        ...(parsed.attachments.length ? { attachments: parsed.attachments } : {}),
      },
      SEND_TIMEOUT_MS,
    );
    return NextResponse.json({ ok: true, runId: out?.runId ?? null, status: out?.status ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 502 });
  }
}
