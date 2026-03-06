import { describe, expect, it, vi, beforeEach } from "vitest";

import { listLocalTeamIds } from "@/lib/teams";

vi.mock("node:fs/promises", () => ({
  default: {
    readdir: vi.fn(),
  },
}));

import fs from "node:fs/promises";

describe("lib/teams", () => {
  beforeEach(() => {
    vi.mocked(fs.readdir).mockReset();
  });

  it("returns team ids from ~/.openclaw/workspace-* directories", async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: "workspace-dev", isDirectory: () => true },
      { name: "workspace-claw-marketing-team", isDirectory: () => true },
      { name: "workspace-not-a-dir", isDirectory: () => false },
      { name: "random", isDirectory: () => true },
    ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    const ids = await listLocalTeamIds();
    expect(ids).toEqual(["claw-marketing-team", "dev"]);
  });

  it("returns [] when base dir missing", async () => {
    vi.mocked(fs.readdir).mockRejectedValue({ code: "ENOENT" });
    const ids = await listLocalTeamIds();
    expect(ids).toEqual([]);
  });
});
