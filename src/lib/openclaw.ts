import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runOpenClaw(args: string[]) {
  // Use execFile (no shell) for safety.
  const { stdout, stderr } = await execFileAsync("openclaw", args, {
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
  });
  return { stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" };
}
