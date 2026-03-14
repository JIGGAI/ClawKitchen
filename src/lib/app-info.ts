import pkg from "../../package.json";

// Loaded once at module init (cached by Node/Next). Avoids per-render disk reads.
export const APP_VERSION = String((pkg as { version?: string }).version ?? "");

export function getAppTitle(): string {
  const v = APP_VERSION.trim();
  return v ? `ClawKitchen (${v}-beta)` : "ClawKitchen";
}
