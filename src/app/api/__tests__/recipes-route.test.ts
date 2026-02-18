import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../recipes/route";

vi.mock("@/lib/openclaw", () => ({
  runOpenClaw: vi.fn(),
}));

import { runOpenClaw } from "@/lib/openclaw";

describe("api recipes route", () => {
  beforeEach(() => {
    vi.mocked(runOpenClaw).mockReset();
  });

  it("returns recipes when openclaw outputs valid JSON array", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify([{ id: "r1", name: "Recipe 1" }]),
      stderr: "",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recipes).toHaveLength(1);
    expect(json.recipes[0].id).toBe("r1");
  });

  it("returns 500 when stdout is invalid JSON", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "not json",
      stderr: "",
    });

    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to parse openclaw recipes list output");
  });

  it("returns empty array when data is not array", async () => {
    vi.mocked(runOpenClaw).mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify({ not: "array" }),
      stderr: "",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.recipes).toEqual([]);
  });
});
