import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../cron/job/route";

vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));

import { runOpenClaw } from "@/lib/openclaw";

describe("api cron job route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: "{}", stderr: "" });
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

  it("calls openclaw cron enable", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ id: "job-1", action: "enable" }),
      })
    );
    expect(res.status).toBe(200);
    expect(runOpenClaw).toHaveBeenCalledWith(["cron", "enable", "job-1"]);
  });

  it("calls openclaw cron disable", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ id: "job-1", action: "disable" }),
      })
    );
    expect(res.status).toBe(200);
    expect(runOpenClaw).toHaveBeenCalledWith(["cron", "disable", "job-1"]);
  });

  it("calls openclaw cron run", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: JSON.stringify({ ran: true }), stderr: "" });
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ id: "job-1", action: "run" }),
      })
    );
    expect(res.status).toBe(200);
    expect(runOpenClaw).toHaveBeenCalledWith(["cron", "run", "job-1", "--json"]);
    const json = await res.json();
    expect(json.result.ok).toBe(true);
  });
});
