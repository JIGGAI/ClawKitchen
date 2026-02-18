/**
 * Extracts a string message from an unknown error value.
 * Used consistently across API routes and client components.
 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
