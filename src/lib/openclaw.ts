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

async function runOpenClawLocal(args: string[]): Promise<OpenClawExecResult> {
  try {
    const res = await execFileAsync("openclaw", args, {
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      ok: true,
      exitCode: 0,
      stdout: String(res.stdout ?? ""),
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

    const stdout = String(res.stdout ?? "");
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
