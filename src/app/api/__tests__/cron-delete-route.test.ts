import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../cron/delete/route";

vi.mock("@/lib/gateway", () => ({ toolsInvoke: vi.fn() }));
vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  default: {
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import { toolsInvoke } from "@/lib/gateway";
import { runOpenClaw } from "@/lib/openclaw";
import fs from "node:fs/promises";

describe("api cron delete route", () => {
  beforeEach(() => {
    vi.mocked(toolsInvoke).mockReset();
    vi.mocked(runOpenClaw).mockReset();
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.stat).mockReset();
    vi.mocked(fs.readFile).mockReset();
    vi.mocked(fs.writeFile).mockReset();
  });

  it("returns 400 when id missing", async () => {
    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({}) })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("id is required");
  });

  it("returns 200 and invokes cron remove", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: "{}", stderr: "" });

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "job-1" }) })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.id).toBe("job-1");
    expect(runOpenClaw).toHaveBeenCalledWith(["cron", "rm", "job-1", "--json"]);
  });

  it("marks orphaned entries in cron-jobs.json when mapping references job", async () => {
    const baseHome = "/mock/base";
    vi.mocked(runOpenClaw).mockResolvedValue({ ok: true, exitCode: 0, stdout: "{}", stderr: "" });
    vi.mocked(toolsInvoke)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              result: {
                raw: JSON.stringify({
                  agents: { defaults: { workspace: baseHome + "/agents" } },
                }),
              },
            }),
          },
        ],
      });
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: "workspace-team1", isDirectory: () => true } as never,
    ]);
    vi.mocked(fs.stat).mockResolvedValue({} as never);
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        version: 1,
        entries: {
          "recipe-1": { installedCronId: "job-1", orphaned: false },
          "recipe-2": { installedCronId: "other", orphaned: false },
        },
      })
    );
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const res = await POST(
      new Request("https://test", { method: "POST", body: JSON.stringify({ id: "job-1" }) })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.orphanedIn).toHaveLength(1);
    expect(json.orphanedIn[0].teamId).toBe("team1");
    expect(json.orphanedIn[0].keys).toContain("recipe-1");
    expect(fs.writeFile).toHaveBeenCalled();
    const written = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
    expect(written.entries["recipe-1"].orphaned).toBe(true);
  });
});
