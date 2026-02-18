import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../cron/job/route";

vi.mock("@/lib/gateway", () => ({ toolsInvoke: vi.fn() }));

import { toolsInvoke } from "@/lib/gateway";

describe("api cron job route", () => {
  beforeEach(() => {
    vi.mocked(toolsInvoke).mockReset();
    vi.mocked(toolsInvoke).mockResolvedValue({ ok: true });
  });

  it("returns 400 when id or action missing", async () => {
    const r1 = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ action: "enable" }),
      })
    );
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toBe("id is required");

    const r2 = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ id: "job-1", action: "invalid" }),
      })
    );
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toBe("action must be enable|disable|run");
  });

  it("calls toolsInvoke for enable", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ id: "job-1", action: "enable" }),
      })
    );
    expect(res.status).toBe(200);
    expect(toolsInvoke).toHaveBeenCalledWith({
      tool: "cron",
      args: { action: "update", jobId: "job-1", patch: { enabled: true } },
    });
  });

  it("calls toolsInvoke for disable", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ id: "job-1", action: "disable" }),
      })
    );
    expect(res.status).toBe(200);
    expect(toolsInvoke).toHaveBeenCalledWith({
      tool: "cron",
      args: { action: "update", jobId: "job-1", patch: { enabled: false } },
    });
  });

  it("calls toolsInvoke for run", async () => {
    vi.mocked(toolsInvoke).mockResolvedValue({ ok: true, result: { ran: true } });
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ id: "job-1", action: "run" }),
      })
    );
    expect(res.status).toBe(200);
    expect(toolsInvoke).toHaveBeenCalledWith({
      tool: "cron",
      args: { action: "run", jobId: "job-1" },
    });
    const json = await res.json();
    expect(json.result).toEqual({ ok: true, result: { ran: true } });
  });
});
