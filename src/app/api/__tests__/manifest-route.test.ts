import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "../manifest/route";

vi.mock("@/lib/manifest", () => ({
  readManifest: vi.fn(),
  isManifestStale: vi.fn(),
  triggerManifestRegeneration: vi.fn(),
}));

import { readManifest, isManifestStale, triggerManifestRegeneration } from "@/lib/manifest";

const FRESH_MANIFEST = {
  version: 1 as const,
  generatedAt: new Date().toISOString(),
  teams: { "my-team": { teamId: "my-team", displayName: "My Team", roles: ["lead"], ticketCounts: { backlog: 3, "in-progress": 1, testing: 0, done: 5, total: 9 }, activeRunCount: 0 } },
  agents: [{ id: "agent-1" }],
  recipes: [{ id: "my-team", name: "My Team", kind: "team" as const, source: "builtin" as const }],
};

describe("GET /api/manifest", () => {
  beforeEach(() => {
    vi.mocked(readManifest).mockReset();
    vi.mocked(isManifestStale).mockReset();
    vi.mocked(triggerManifestRegeneration).mockReset();
  });

  it("returns manifest when fresh", async () => {
    vi.mocked(readManifest).mockResolvedValue(FRESH_MANIFEST);
    vi.mocked(isManifestStale).mockReturnValue(false);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.version).toBe(1);
    expect(json.teams["my-team"].ticketCounts.total).toBe(9);
    expect(json.agents).toHaveLength(1);
    expect(triggerManifestRegeneration).not.toHaveBeenCalled();
  });

  it("returns manifest and triggers regen when stale", async () => {
    vi.mocked(readManifest).mockResolvedValue(FRESH_MANIFEST);
    vi.mocked(isManifestStale).mockReturnValue(true);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.version).toBe(1);
    expect(triggerManifestRegeneration).toHaveBeenCalledOnce();
  });

  it("returns 503 and triggers regen when manifest missing", async () => {
    vi.mocked(readManifest).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(triggerManifestRegeneration).toHaveBeenCalledOnce();
  });
});
