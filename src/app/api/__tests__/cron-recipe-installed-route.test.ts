import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../cron/recipe-installed/route";

vi.mock("@/lib/gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gateway")>();
  return { ...actual, toolsInvoke: vi.fn() };
});
vi.mock("node:fs/promises", () => ({ default: { readFile: vi.fn() } }));

import { toolsInvoke } from "@/lib/gateway";
import fs from "node:fs/promises";

describe("api cron recipe-installed route", () => {
  const baseWorkspace = "/home/x/.openclaw/agents";
  const gatewayConfigResponse = {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          result: {
            raw: JSON.stringify({
              agents: { defaults: { workspace: baseWorkspace } },
            }),
          },
        }),
      },
    ],
  };

  beforeEach(() => {
    vi.mocked(toolsInvoke).mockReset();
    vi.mocked(fs.readFile).mockReset();

    vi.mocked(toolsInvoke)
      .mockResolvedValueOnce(gatewayConfigResponse as never)
      .mockResolvedValueOnce({ jobs: [] } as never);
  });

  it("returns 400 when teamId missing", async () => {
    const res = await GET(new Request("https://test"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("teamId is required");
  });

  it("returns 500 when gateway config has no text", async () => {
    vi.mocked(toolsInvoke).mockReset();
    vi.mocked(toolsInvoke).mockResolvedValue({ content: [] } as never);

    const res = await GET(
      new Request("https://test?teamId=my-team")
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to fetch config via gateway");
  });

  it("returns 500 when workspace not set", async () => {
    vi.mocked(toolsInvoke).mockReset();
    vi.mocked(toolsInvoke).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ result: { raw: "{}" } }) }],
    } as never);

    const res = await GET(
      new Request("https://test?teamId=my-team")
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("agents.defaults.workspace not set");
  });

  it("returns jobs filtered by mapping", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        version: 1,
        entries: {
          r1: { installedCronId: "cron-1", orphaned: false },
          r2: { installedCronId: "cron-2", orphaned: false },
        },
      })
    );
    vi.mocked(toolsInvoke)
      .mockReset()
      .mockResolvedValueOnce(gatewayConfigResponse as never)
      .mockResolvedValueOnce({
        jobs: [
          { id: "cron-1", name: "J1" },
          { id: "cron-2", name: "J2" },
          { id: "cron-3", name: "J3" },
        ],
      } as never);

    const res = await GET(
      new Request("https://test?teamId=my-team")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.jobCount).toBe(2);
    expect(json.jobs).toHaveLength(2);
    expect(json.jobs.map((j: { id: string }) => j.id)).toEqual(["cron-1", "cron-2"]);
  });

  it("returns empty jobs when mapping file missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const res = await GET(
      new Request("https://test?teamId=my-team")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.jobs).toEqual([]);
    expect(json.jobCount).toBe(0);
  });
});
