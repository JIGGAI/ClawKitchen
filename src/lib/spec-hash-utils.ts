import crypto from "node:crypto";

/**
 * Generate a hash for trigger spec to detect changes
 */
export function createSpecHash(data: Record<string, unknown>): string {
  const normalized = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}