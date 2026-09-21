import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workflows/overview", () => ({
  resolveTeamIds: vi.fn(),
  listRunGraphs: vi.fn(),
  RUN_SORTS: ["newest", "oldest", "updated"],
}));

import { listRunGraphs, resolveTeamIds } from "@/lib/workflows/overview";
import { GET } from "../workflows/runs/route";

describe("api workflows runs route", () => {
  beforeEach(() => {
    vi.mocked(resolveTeamIds).mockReset().mockResolvedValue(["alpha"]);
    vi.mocked(listRunGraphs).mockReset().mockResolvedValue({ runs: [], total: 0, facets: { workflows: [], statuses: [] } });
  });

  it("defaults the limit to 20 and passes the team through", async () => {
    const res = await GET(new Request("https://test/api/workflows/runs?team=alpha"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, runs: [], total: 0, facets: { workflows: [], statuses: [] } });
    expect(resolveTeamIds).toHaveBeenCalledWith("alpha");
    expect(listRunGraphs).toHaveBeenCalledWith({ teamIds: ["alpha"], limit: 20, filters: { workflow: null, status: null, q: null, sort: "newest" } });
  });

  it.each([
    ["0", 1],
    ["45.9", 45],
    ["9999", 200],
    ["abc", 20],
  ])("clamps limit=%s to %d", async (raw, expected) => {
    await GET(new Request(`https://test/api/workflows/runs?limit=${raw}`));
    expect(listRunGraphs).toHaveBeenCalledWith(expect.objectContaining({ teamIds: ["alpha"], limit: expected }));
  });

  it("passes filters through and falls back to newest for an unknown sort", async () => {
    await GET(new Request("https://test/api/workflows/runs?workflow=post&status=error&q=%20x%20&sort=oldest"));
    expect(listRunGraphs).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: { workflow: "post", status: "error", q: "x", sort: "oldest" } }),
    );
    await GET(new Request("https://test/api/workflows/runs?sort=bogus"));
    expect(listRunGraphs).toHaveBeenLastCalledWith(expect.objectContaining({ filters: expect.objectContaining({ sort: "newest" }) }));
  });

  it("returns 400 for an invalid team", async () => {
    vi.mocked(resolveTeamIds).mockRejectedValueOnce(new Error("Invalid team id"));
    const res = await GET(new Request("https://test/api/workflows/runs?team=../x"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid team id" });
  });

  it("returns 500 when listing fails", async () => {
    vi.mocked(listRunGraphs).mockRejectedValueOnce(new Error("disk gone"));
    const res = await GET(new Request("https://test/api/workflows/runs"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "disk gone" });
  });
});
