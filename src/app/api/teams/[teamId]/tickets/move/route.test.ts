import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("@/lib/tickets", () => ({ getTicketMarkdown: vi.fn() }));

import { runOpenClaw } from "@/lib/openclaw";
import { getTicketMarkdown } from "@/lib/tickets";
import { POST } from "./route";

async function mkTmpFile(contents: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ck-ticket-move-"));
  const file = path.join(dir, "ticket.md");
  await fs.writeFile(file, contents, "utf8");
  return file;
}

describe("team tickets move route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(getTicketMarkdown).mockReset();
  });

  it("returns 400 when ticket missing", async () => {
    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ to: "done" }) }),
      { params: Promise.resolve({ teamId: "dev" }) },
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing ticket");
  });

  it("returns 400 when destination invalid", async () => {
    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ ticket: "T-1", to: "wat" }) }),
      { params: Promise.resolve({ teamId: "dev" }) },
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid destination stage");
  });

  it("calls openclaw recipes move-ticket", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: "", stderr: "" });

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ ticket: "T-1", to: "testing" }) }),
      { params: Promise.resolve({ teamId: "dev" }) },
    );

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    expect(runOpenClaw).toHaveBeenCalledWith(
      expect.arrayContaining(["recipes", "move-ticket", "--team-id", "dev", "--ticket", "T-1", "--to", "testing"]),
    );
  });

  it("appends an audit comment when marking done", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: "", stderr: "" });

    const file = await mkTmpFile("# 0001-test\n\n## Comments\n- 2026-01-01 old\n");
    vi.mocked(getTicketMarkdown).mockResolvedValue({
      teamId: "dev",
      id: "0001-test",
      file,
      markdown: await fs.readFile(file, "utf8"),
      owner: "dev",
      stage: "in-progress",
    });

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ ticket: "0001-test", to: "done" }) }),
      { params: Promise.resolve({ teamId: "dev" }) },
    );

    expect(res.status).toBe(200);

    const updated = await fs.readFile(file, "utf8");
    expect(updated).toMatch(/\(ClawKitchen UI\): Marked done from ClawKitchen UI/);
  });
});
