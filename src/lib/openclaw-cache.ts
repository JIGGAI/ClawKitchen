import { runOpenClaw, type OpenClawExecResult } from "@/lib/openclaw";

// `openclaw <cmd>` invocations spawn a subprocess that pays a fixed startup
// cost (~15-20s on this machine). Server components that read configuration
// — agents list, recipes list, plugins list — call these on every render,
// including each 3s `router.refresh()` poll on live pages, blocking the page
// behind that subprocess.
//
// This helper memoizes successful results by argv key for a short window so
// renders return fast. Concurrent callers share one in-flight subprocess
// instead of spawning duplicates. Only successful results are cached so a
// transient failure won't stick. Callers that mutate state (cron rm, recipes
// delete, etc.) and routes that need fresh post-mutation reads should use
// `runOpenClaw` directly instead.

const DEFAULT_TTL_MS = 30_000;

const cache = new Map<string, { value: OpenClawExecResult; expires: number }>();
const inflight = new Map<string, Promise<OpenClawExecResult>>();

export async function cachedRunOpenClaw(
  args: string[],
  options: { ttlMs?: number } = {}
): Promise<OpenClawExecResult> {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const key = JSON.stringify(args);
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expires) return cached.value;
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const value = await runOpenClaw(args);
      if (value.ok) cache.set(key, { value, expires: Date.now() + ttl });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/**
 * Invalidate one or more cached entries by argv. Mutation routes (e.g.
 * `cron rm`, `cron enable`) call this after a successful write so the next
 * read returns fresh data instead of waiting for the TTL to expire.
 *
 * Each argv is matched as a prefix: `invalidateOpenClawCache(["cron"])` clears
 * every cached `openclaw cron *` call. Pass an exact argv to scope tightly.
 */
export function invalidateOpenClawCache(...argvs: string[][]): void {
  for (const argv of argvs) {
    const prefix = JSON.stringify(argv).replace(/\]$/, "");
    for (const key of cache.keys()) {
      if (key === JSON.stringify(argv) || key.startsWith(prefix)) cache.delete(key);
    }
    for (const key of inflight.keys()) {
      if (key === JSON.stringify(argv) || key.startsWith(prefix)) inflight.delete(key);
    }
  }
}

/** Test-only: clear all cached subprocess results. */
export function _resetOpenClawCache() {
  cache.clear();
  inflight.clear();
}
