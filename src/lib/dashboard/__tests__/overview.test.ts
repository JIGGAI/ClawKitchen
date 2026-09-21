import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ root: "" }));

vi.mock("@/lib/paths", () => ({
  getTeamWorkspaceDir: vi.fn(async (teamId: string) => `${ctx.root}/workspace-${teamId}`),
}));

import { readAgentQueues } from "@/lib/dashboard/overview";

const QDIR = "workspace-alpha/shared-context/workflow-queues";

async function write(rel: string, data: string) {
  const p = path.join(ctx.root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data, "utf8");
}

const line = (id: string, nodeId: string) =>
  JSON.stringify({ id, ts: "2026-09-21T10:00:00.000Z", teamId: "alpha", runId: "run-1", nodeId, kind: "execute_node" }) + "\n";

beforeEach(async () => {
  ctx.root = await fs.mkdtemp(path.join(os.tmpdir(), "ck-dashboard-"));
});

afterEach(async () => {
  await fs.rm(ctx.root, { recursive: true, force: true });
});

describe("readAgentQueues", () => {
  it("splits consumed and pending tasks at the byte offset and joins claims to tasks", async () => {
    const consumed = line("t1", "draft");
    await write(`${QDIR}/alpha-writer.jsonl`, consumed + line("t2", "qc") + "not json\n");
    await write(`${QDIR}/alpha-writer.state.json`, JSON.stringify({ offsetBytes: Buffer.byteLength(consumed) }));
    await write(`${QDIR}/claims/alpha-writer.t1.json`, JSON.stringify({ taskId: "t1", agentId: "alpha-writer", claimedAt: "2026-09-21T10:01:00.000Z" }));
    await write(`${QDIR}/claims/alpha-writer-2.t9.json`, JSON.stringify({ taskId: "t9", agentId: "alpha-writer-2" }));
    await write(`${QDIR}/alpha-idle.jsonl`, "");

    const queues = await readAgentQueues(["alpha", "missing"]);
    const writer = queues.find((q) => q.agentId === "alpha-writer");

    expect(queues.map((q) => q.agentId).sort()).toEqual(["alpha-idle", "alpha-writer"]);
    expect(writer?.pending.map((t) => t.id)).toEqual(["t2"]);
    expect(writer?.claims).toEqual([
      {
        taskId: "t1",
        claimedAt: "2026-09-21T10:01:00.000Z",
        leaseSeconds: null,
        task: { id: "t1", ts: "2026-09-21T10:00:00.000Z", runId: "run-1", nodeId: "draft" },
      },
    ]);
  });

  it("treats an offset past the end of the file as a reset, like the worker does", async () => {
    await write(`${QDIR}/alpha-writer.jsonl`, line("t1", "draft"));
    await write(`${QDIR}/alpha-writer.state.json`, JSON.stringify({ offsetBytes: 99999 }));
    const [q] = await readAgentQueues(["alpha"]);
    expect(q.pending.map((t) => t.id)).toEqual(["t1"]);
  });
});
