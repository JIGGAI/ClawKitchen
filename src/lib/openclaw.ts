import { getKitchenApi } from "@/lib/kitchen-api";

export type OpenClawExecResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function runOpenClaw(args: string[]): Promise<OpenClawExecResult> {
  // Avoid child_process usage in plugin code (triggers OpenClaw install-time safety warnings).
  // Delegate to the OpenClaw runtime helper instead.
  const api = getKitchenApi();

  try {
    const res = await api.runtime.system.runCommandWithTimeout(["openclaw", ...args], { timeoutMs: 120000 });
    return { ok: true, exitCode: 0, stdout: String(res.stdout ?? ""), stderr: String(res.stderr ?? "") };
  } catch (e: unknown) {
    const err = e as { code?: unknown; stdout?: unknown; stderr?: unknown; message?: unknown };
    const exitCode = typeof err.code === "number" ? err.code : 1;
    const stdout = typeof err.stdout === "string" ? err.stdout : "";
    const stderr = typeof err.stderr === "string" ? err.stderr : typeof err.message === "string" ? err.message : String(e);
    return { ok: false, exitCode, stdout, stderr };
  }
}
