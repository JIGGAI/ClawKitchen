import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Mock fs to control manifest file reads
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, default: { ...actual.default, readFile: vi.fn() } };
});

// Mock openclaw to prevent real subprocess calls from triggerManifestRegeneration
vi.mock("@/lib/openclaw", () => ({ runOpenClaw: vi.fn().mockResolvedValue({ ok: true, stdout: "{}", stderr: "" }) }));

import { readManifest, isManifestStale, type KitchenManifest } from "../manifest";

const MANIFEST_PATH = path.join(os.homedir(), ".openclaw", "kitchen-manifest.json");

function makeManifest(overrides?: Partial<KitchenManifest>): KitchenManifest {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    teams: {
      "test-team": {
        teamId: "test-team",
        displayName: "Test Team",
        roles: ["lead", "dev"],
        ticketCounts: { backlog: 5, "in-progress": 2, testing: 1, done: 10, total: 18 },
        activeRunCount: 1,
      },
    },
    agents: [{ id: "agent-1", identityName: "Agent One" }],
    recipes: [{ id: "test-team", name: "Test Team", kind: "team", source: "builtin" }],
    ...overrides,
  };
}

describe("manifest reader", () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockReset();
  });

  it("reads and parses a valid manifest", async () => {
    const manifest = makeManifest();
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(manifest));

    const result = await readManifest();

    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.teams["test-team"].ticketCounts.total).toBe(18);
    expect(result!.agents).toHaveLength(1);
    expect(result!.recipes).toHaveLength(1);
    expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith(MANIFEST_PATH, "utf8");
  });

  it("returns null when file is missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const result = await readManifest();
    expect(result).toBeNull();
  });

  it("returns null when file contains invalid JSON", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("not json{{{");

    const result = await readManifest();
    expect(result).toBeNull();
  });

  it("returns null when version is wrong", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: 99, generatedAt: "x", teams: {}, agents: [], recipes: [] }));

    const result = await readManifest();
    expect(result).toBeNull();
  });

  it("returns null when generatedAt is missing", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ version: 1, teams: {}, agents: [], recipes: [] }));

    const result = await readManifest();
    expect(result).toBeNull();
  });
});

describe("isManifestStale", () => {
  it("returns false for fresh manifest", () => {
    const manifest = makeManifest({ generatedAt: new Date().toISOString() });
    expect(isManifestStale(manifest)).toBe(false);
  });

  it("returns true for old manifest", () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    const manifest = makeManifest({ generatedAt: old });
    expect(isManifestStale(manifest)).toBe(true);
  });
});
