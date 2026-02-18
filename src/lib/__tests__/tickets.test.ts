import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  parseTitle,
  stageDir,
  parseNumberFromFilename,
  listTickets,
  getTicketMarkdown,
} from "../tickets";
import fs from "node:fs/promises";

vi.mock("node:fs/promises", () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    stat: vi.fn(),
  },
}));

describe("tickets", () => {
  describe("stageDir", () => {
    it("maps each stage to correct path", () => {
      expect(stageDir("backlog")).toContain("work/backlog");
      expect(stageDir("in-progress")).toContain("work/in-progress");
      expect(stageDir("testing")).toContain("work/testing");
      expect(stageDir("done")).toContain("work/done");
    });
  });

  describe("parseTitle", () => {
    it("derives title from slug when no explicit title", () => {
      expect(parseTitle("# 0033-fix-login-bug")).toBe("Fix Login Bug");
      expect(parseTitle("# 0042-api-rate-limits")).toBe("API Rate Limits");
    });

    it("keeps explicit title when present", () => {
      expect(parseTitle("# 0033-fix-login Fix the login bug")).toBe("Fix the login bug");
    });

    it("handles acronyms in slug", () => {
      expect(parseTitle("# 0100-api-cli-integration")).toContain("API");
      expect(parseTitle("# 0100-api-cli-integration")).toContain("CLI");
    });

    it("returns untitled for empty or missing header", () => {
      expect(parseTitle("")).toBe("(untitled)");
      expect(parseTitle("no header here")).toBe("(untitled)");
    });
  });

  describe("parseNumberFromFilename", () => {
    it("extracts 4-digit prefix", () => {
      expect(parseNumberFromFilename("0033-fix-login.md")).toBe(33);
      expect(parseNumberFromFilename("0042-something.md")).toBe(42);
      expect(parseNumberFromFilename("0001-first.md")).toBe(1);
    });

    it("returns null for invalid filenames", () => {
      expect(parseNumberFromFilename("abc-def.md")).toBeNull();
      expect(parseNumberFromFilename("33-something.md")).toBeNull();
      expect(parseNumberFromFilename("00333-too-long.md")).toBeNull();
    });
  });

  describe("listTickets", () => {
    beforeEach(() => {
      vi.mocked(fs.readdir).mockReset();
      vi.mocked(fs.readFile).mockReset();
      vi.mocked(fs.stat).mockReset();
    });

    it("returns tickets from all stages", async () => {
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(["0033-fix-login.md"])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      vi.mocked(fs.readFile).mockResolvedValue("# 0033-fix-login Fix Login\n\nOwner: alice");
      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date("2026-01-15T10:00:00Z"),
        mtimeMs: new Date("2026-01-15T10:00:00Z").getTime(),
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);

      const result = await listTickets();
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(33);
      expect(result[0].id).toBe("0033-fix-login");
      expect(result[0].title).toBe("Fix Login");
      expect(result[0].owner).toBe("alice");
      expect(result[0].stage).toBe("backlog");
    });

    it("skips stages that throw", async () => {
      vi.mocked(fs.readdir)
        .mockRejectedValueOnce(new Error("no dir"))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await listTickets();
      expect(result).toEqual([]);
    });

    it("skips non-md files", async () => {
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(["0033-a.md", "readme.txt"])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      vi.mocked(fs.readFile).mockResolvedValue("# 0033-a\n");
      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date(),
        mtimeMs: Date.now(),
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);

      const result = await listTickets();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("0033-a");
    });
  });

  describe("getTicketMarkdown", () => {
    beforeEach(() => {
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(["0033-fix.md"])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce("# 0033-fix Fix it\n")
        .mockResolvedValueOnce("# 0033-fix Fix it\n");
      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date(),
        mtimeMs: Date.now(),
      } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
    });

    it("finds by id and returns markdown", async () => {
      const result = await getTicketMarkdown("0033-fix");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("0033-fix");
      expect(result!.markdown).toContain("Fix it");
    });

    it("finds by number", async () => {
      const result = await getTicketMarkdown("33");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("0033-fix");
    });

    it("returns null when not found", async () => {
      vi.mocked(fs.readdir).mockReset().mockResolvedValue([]);
      const result = await getTicketMarkdown("9999");
      expect(result).toBeNull();
    });
  });
});
