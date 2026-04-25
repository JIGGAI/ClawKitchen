import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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
//
// Disk persistence: cache entries also write to
// ~/.openclaw/.kitchen-subprocess-cache/<sha1>.json so the first request
// after a gateway restart can read a still-fresh entry from disk instead of
// paying the full subprocess cost again. Each entry includes its expiry time;
// expired entries are ignored on read.

// 5 min default. Was 30s for in-memory; now that we persist to disk and
// mutations invalidate explicitly, longer TTLs are safe and protect against
// gateway restarts where the previous TTL would have expired before the user
// finished navigating back. Caller can override via { ttlMs }.
const DEFAULT_TTL_MS = 5 * 60_000;
const DISK_CACHE_DIR = path.join(os.homedir(), ".openclaw", ".kitchen-subprocess-cache");

// Skip disk persistence during tests so module-level cache state is the only
// thing tests need to reason about. Tests already reset memory caches; mocking
// disk reads on top of that would be noise.
const DISK_CACHE_ENABLED =
  process.env.NODE_ENV !== "test" && !process.env.VITEST && !process.env.VITEST_WORKER_ID;

const cache = new Map<string, { value: OpenClawExecResult; expires: number }>();
const inflight = new Map<string, Promise<OpenClawExecResult>>();

function diskPathForKey(key: string): string {
  // sha256 just to dodge the sonarjs/hashing lint; this is a filename, not
  // a security primitive. Truncated to 40 chars to keep paths readable.
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 40);
  return path.join(DISK_CACHE_DIR, `${hash}.json`);
}

type DiskEntry = { args: string[]; expires: number; value: OpenClawExecResult };

function readDiskEntry(key: string): { value: OpenClawExecResult; expires: number } | null {
  if (!DISK_CACHE_ENABLED) return null;
  try {
    const raw = readFileSync(diskPathForKey(key), "utf8");
    const parsed = JSON.parse(raw) as DiskEntry;
    if (parsed.expires <= Date.now()) return null;
    if (JSON.stringify(parsed.args) !== key) return null;
    return { value: parsed.value, expires: parsed.expires };
  } catch {
    return null;
  }
}

function writeDiskEntry(args: string[], value: OpenClawExecResult, expires: number): void {
  if (!DISK_CACHE_ENABLED) return;
  try {
    mkdirSync(DISK_CACHE_DIR, { recursive: true });
    const key = JSON.stringify(args);
    const entry: DiskEntry = { args, expires, value };
    writeFileSync(diskPathForKey(key), JSON.stringify(entry), "utf8");
  } catch {
    // Disk cache is opportunistic — failing to write is non-fatal; in-memory
    // cache still serves this process.
  }
}

function deleteDiskEntry(key: string): void {
  if (!DISK_CACHE_ENABLED) return;
  try {
    unlinkSync(diskPathForKey(key));
  } catch {
    // already gone
  }
}

export async function cachedRunOpenClaw(
  args: string[],
  options: { ttlMs?: number } = {}
): Promise<OpenClawExecResult> {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const key = JSON.stringify(args);

  const memHit = cache.get(key);
  if (memHit && Date.now() < memHit.expires) return memHit.value;

  const existing = inflight.get(key);
  if (existing) return existing;

  // Disk fallback for the first request after gateway restart. If the disk
  // entry is still valid, serve it AND populate the in-memory cache so further
  // requests skip the disk read.
  const diskHit = readDiskEntry(key);
  if (diskHit) {
    cache.set(key, diskHit);
    return diskHit.value;
  }

  const promise = (async () => {
    try {
      const value = await runOpenClaw(args);
      if (value.ok) {
        const expires = Date.now() + ttl;
        cache.set(key, { value, expires });
        writeDiskEntry(args, value, expires);
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

function entryArgsMatchAnyPrefix(entryArgs: string[], argvs: string[][]): boolean {
  return argvs.some((argv) => argv.length <= entryArgs.length && argv.every((p, i) => entryArgs[i] === p));
}

function diskKeysMatching(argvs: string[][]): string[] {
  if (!DISK_CACHE_ENABLED || !existsSync(DISK_CACHE_DIR)) return [];
  let files: string[] = [];
  try {
    files = readdirSync(DISK_CACHE_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const matched: string[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(path.join(DISK_CACHE_DIR, file), "utf8")) as { args?: unknown };
      if (!Array.isArray(parsed.args)) continue;
      const entryArgs = parsed.args as string[];
      if (entryArgsMatchAnyPrefix(entryArgs, argvs)) matched.push(JSON.stringify(entryArgs));
    } catch {
      // skip unreadable
    }
  }
  return matched;
}

/**
 * Invalidate one or more cached entries by argv. Mutation routes (e.g.
 * `cron rm`, `cron enable`) call this after a successful write so the next
 * read returns fresh data instead of waiting for the TTL to expire.
 *
 * Each argv is matched as a prefix: `invalidateOpenClawCache(["cron"])` clears
 * every cached `openclaw cron *` call. Pass an exact argv to scope tightly.
 *
 * Also clears matching disk entries so the next request after a restart
 * doesn't replay stale results.
 */
export function invalidateOpenClawCache(...argvs: string[][]): void {
  for (const argv of argvs) {
    const prefix = JSON.stringify(argv).replace(/\]$/, "");
    const exact = JSON.stringify(argv);
    for (const key of cache.keys()) {
      if (key === exact || key.startsWith(prefix)) cache.delete(key);
    }
    for (const key of inflight.keys()) {
      if (key === exact || key.startsWith(prefix)) inflight.delete(key);
    }
  }
  for (const key of diskKeysMatching(argvs)) deleteDiskEntry(key);
}

/** Test-only: clear all cached subprocess results (memory + disk). */
export function _resetOpenClawCache() {
  cache.clear();
  inflight.clear();
  if (DISK_CACHE_ENABLED && existsSync(DISK_CACHE_DIR)) {
    try {
      for (const f of readdirSync(DISK_CACHE_DIR)) {
        if (f.endsWith(".json")) {
          try {
            unlinkSync(path.join(DISK_CACHE_DIR, f));
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }
}
