import { getKitchenApi } from "@/lib/kitchen-api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type OpenClawExecResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
};

function extractStdout(err: { stdout?: unknown }): string {
  if (typeof err.stdout === "string") return err.stdout;
  if (err.stdout && typeof err.stdout === "object" && "toString" in err.stdout) {
    return String((err.stdout as { toString: () => string }).toString());
  }
  return "";
}

function resolveExitCode(res: { exitCode?: unknown; code?: unknown; status?: unknown }): number {
  if (typeof res.exitCode === "number") return res.exitCode;
  if (typeof res.code === "number") return res.code;
  if (typeof res.status === "number") return res.status;
  return 0;
}

function extractStderr(err: { stderr?: unknown; message?: unknown }, fallback: unknown): string {
  if (typeof err.stderr === "string") return err.stderr;
  if (err.stderr && typeof err.stderr === "object" && "toString" in err.stderr) {
    return String((err.stderr as { toString: () => string }).toString());
  }
  if (typeof err.message === "string") return err.message;
  return String(fallback);
}

/**
 * Strip non-JSON diagnostic lines from stdout.
 *
 * OpenClaw may print plugin/doctor/diagnostic lines to stdout before the
 * actual JSON payload (e.g. "[doctor] ...", "[plugins] ...", "🦞 OpenClaw ...").
 * This breaks callers that do JSON.parse(stdout).
 *
 * If stdout looks like it contains a JSON payload with leading noise, strip the
 * noise lines. Otherwise return as-is (non-JSON commands like `config get` may
 * return plain text).
 */
function sanitizeStdout(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  // Fast path: already starts with JSON
  const firstChar = trimmed[0];
  if (firstChar === "[" || firstChar === "{" || firstChar === '"') return raw;

  // Look for the first line starting with a JSON token
  const lines = trimmed.split("\n");
  const jsonStartIdx = lines.findIndex((l) => /^\s*[[\{"]/.test(l));
  if (jsonStartIdx > 0) {
    // Verify the remainder is valid JSON before stripping
    const candidate = lines.slice(jsonStartIdx).join("\n");
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Not valid JSON after stripping — return original
    }
  }

  return raw;
}

async function runOpenClawLocal(args: string[]): Promise<OpenClawExecResult> {
  try {
    const isWindows = process.platform === "win32";
    const res = await execFileAsync("openclaw", args, {
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      // Windows requires shell:true to resolve executables on PATH via PATHEXT.
      // Without it, execFile throws ENOENT even when openclaw is installed globally.
      ...(isWindows ? { shell: true } : {}),
    });

    return {
      ok: true,
      exitCode: 0,
      stdout: sanitizeStdout(String(res.stdout ?? "")),
      stderr: String(res.stderr ?? ""),
    };
  } catch (e: unknown) {
    const err = e as { code?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown };
    const exitCode = typeof err.code === "number" ? err.code : 1;
    const stdout = extractStdout(err);
    const stderr = extractStderr(err, e);
    return { ok: false, exitCode, stdout, stderr };
  }
}

/**
 * Extract a JSON payload from stdout that may contain non-JSON diagnostic lines
 * (e.g. [doctor], [plugins], [recipes] log lines before the actual JSON).
 * Returns the parsed value or null if no JSON found.
 */
export function extractJson<T = unknown>(stdout: string): T | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  // Fast path: pure JSON
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through
  }

  // Find the first line starting with [ or { (JSON array/object)
  const lines = trimmed.split("\n");
  const jsonStartIdx = lines.findIndex((l) => /^\s*[[\{]/.test(l));
  if (jsonStartIdx >= 0) {
    const jsonSlice = lines.slice(jsonStartIdx).join("\n");
    try {
      return JSON.parse(jsonSlice) as T;
    } catch {
      // fall through
    }
  }

  // Last resort: find the last JSON block (scan from end)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*[\]}]/.test(lines[i])) {
      // Walk backward to find the matching open
      for (let j = i; j >= 0; j--) {
        if (/^\s*[[\{]/.test(lines[j])) {
          try {
            return JSON.parse(lines.slice(j, i + 1).join("\n")) as T;
          } catch {
            // continue searching
          }
        }
      }
    }
  }

  return null;
}

export async function runOpenClaw(args: string[]): Promise<OpenClawExecResult> {
  // In some Kitchen runtime contexts, `api.runtime.system.runCommandWithTimeout`
  // is executed with a restricted allowlist that does not include the `cron` tool,
  // causing `openclaw cron ...` to fail with "Tool not available: cron".
  //
  // Cron routes need to work in the gateway-run Kitchen environment, so for cron
  // specifically we prefer a local exec (host OpenClaw).
  if (args[0] === "cron") return runOpenClawLocal(args);

  const api = getKitchenApi();
  try {
    const res = (await api.runtime.system.runCommandWithTimeout(["openclaw", ...args], { timeoutMs: 120000 })) as {
      stdout?: unknown;
      stderr?: unknown;
      exitCode?: unknown;
      code?: unknown;
      status?: unknown;
    };

    const stdout = sanitizeStdout(String(res.stdout ?? ""));
    const stderr = String(res.stderr ?? "");
    const exitCode = resolveExitCode(res);

    if (exitCode !== 0) return { ok: false, exitCode, stdout, stderr };
    return { ok: true, exitCode: 0, stdout, stderr };
  } catch (e: unknown) {
    const err = e as { code?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown };
    const exitCode = typeof err.code === "number" ? err.code : 1;
    const stdout = extractStdout(err);
    const stderr = extractStderr(err, e);
    return { ok: false, exitCode, stdout, stderr };
  }
}
