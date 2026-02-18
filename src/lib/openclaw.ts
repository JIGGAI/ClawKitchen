import { execFileAsync } from "./exec";

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

function extractStderr(err: { stderr?: unknown; message?: unknown }, fallback: unknown): string {
  if (typeof err.stderr === "string") return err.stderr;
  if (err.stderr && typeof err.stderr === "object" && "toString" in err.stderr) {
    return String((err.stderr as { toString: () => string }).toString());
  }
  if (typeof err.message === "string") return err.message;
  return String(fallback);
}

export async function runOpenClaw(args: string[]): Promise<OpenClawExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync("openclaw", args, {
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
    return { ok: true, exitCode: 0, stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" };
  } catch (e: unknown) {
    const err = e as { code?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown };
    const exitCode = typeof err.code === "number" ? err.code : 1;
    const stdout = extractStdout(err);
    const stderr = extractStderr(err, e);
    return { ok: false, exitCode, stdout, stderr };
  }
}
