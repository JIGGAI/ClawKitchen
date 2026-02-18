import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, POST } from "../goals/route";
import { GET as GET_ID, PUT, DELETE } from "../goals/[id]/route";

vi.mock("@/lib/goals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goals")>();
  return {
    ...actual,
    listGoals: vi.fn(),
    readGoal: vi.fn(),
    writeGoal: vi.fn(),
    deleteGoal: vi.fn(),
  };
});

import { listGoals, readGoal, writeGoal, deleteGoal } from "@/lib/goals";

describe("api goals route", () => {
  beforeEach(() => {
    vi.mocked(listGoals).mockReset();
    vi.mocked(readGoal).mockReset();
    vi.mocked(writeGoal).mockReset();
    vi.mocked(deleteGoal).mockReset();
  });

  describe("GET /api/goals", () => {
    it("returns goals when listGoals succeeds", async () => {
      vi.mocked(listGoals).mockResolvedValue([
        { id: "g1", frontmatter: { id: "g1", title: "Goal 1" }, body: "", raw: "" },
      ]);
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.goals).toHaveLength(1);
      expect(json.goals[0].id).toBe("g1");
    });

    it("returns 500 when listGoals throws", async () => {
      vi.mocked(listGoals).mockRejectedValue(new Error("fs error"));
      const res = await GET();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("fs error");
    });
  });

  describe("POST /api/goals", () => {
    it("returns 400 when id or title missing", async () => {
      const res = await POST(new Request("https://test", { method: "POST", body: JSON.stringify({}) }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("id and title are required");
    });

    it("returns goal when writeGoal succeeds", async () => {
      vi.mocked(writeGoal).mockResolvedValue({
        frontmatter: { id: "g1", title: "G1" },
        body: "",
        raw: "",
      });
      const res = await POST(
        new Request("https://test", {
          method: "POST",
          body: JSON.stringify({ id: "g1", title: "G1" }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.goal.id).toBe("g1");
    });
  });

  describe("GET /api/goals/[id]", () => {
    it("returns goal when found", async () => {
      vi.mocked(readGoal).mockResolvedValue({
        id: "g1",
        frontmatter: { id: "g1", title: "G1" },
        body: "body",
        raw: "raw",
      });
      const res = await GET_ID(new Request("https://test"), { params: Promise.resolve({ id: "g1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.goal.id).toBe("g1");
      expect(json.body).toBe("body");
    });

    it("returns 404 when not found", async () => {
      vi.mocked(readGoal).mockResolvedValue(null);
      const res = await GET_ID(new Request("https://test"), { params: Promise.resolve({ id: "g1" }) });
      expect(res.status).toBe(404);
    });

    it("returns 400 when readGoal throws Invalid goal id or Path traversal", async () => {
      vi.mocked(readGoal).mockRejectedValue(new Error("Invalid goal id"));
      const r1 = await GET_ID(new Request("https://test"), { params: Promise.resolve({ id: "bad" }) });
      expect(r1.status).toBe(400);

      vi.mocked(readGoal).mockRejectedValue(new Error("Path traversal"));
      const r2 = await GET_ID(new Request("https://test"), { params: Promise.resolve({ id: "../x" }) });
      expect(r2.status).toBe(400);
    });

    it("returns 500 when readGoal throws other error", async () => {
      vi.mocked(readGoal).mockRejectedValue(new Error("fs error"));
      const res = await GET_ID(new Request("https://test"), { params: Promise.resolve({ id: "g1" }) });
      expect(res.status).toBe(500);
    });
  });

  describe("PUT /api/goals/[id]", () => {
    it("returns 400 when title missing", async () => {
      const res = await PUT(
        new Request("https://test", { method: "PUT", body: JSON.stringify({}) }),
        { params: Promise.resolve({ id: "g1" }) }
      );
      expect(res.status).toBe(400);
    });

    it("returns goal when writeGoal succeeds", async () => {
      vi.mocked(writeGoal).mockResolvedValue({
        frontmatter: { id: "g1", title: "Updated" },
        body: "",
        raw: "",
      });
      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ title: "Updated" }),
        }),
        { params: Promise.resolve({ id: "g1" }) }
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.goal.title).toBe("Updated");
    });

    it("returns 400 when writeGoal throws Invalid goal id", async () => {
      vi.mocked(writeGoal).mockRejectedValue(new Error("Invalid goal id"));
      const res = await PUT(
        new Request("https://test", { method: "PUT", body: JSON.stringify({ title: "T" }) }),
        { params: Promise.resolve({ id: "bad" }) }
      );
      expect(res.status).toBe(400);
    });

    it("returns 500 when writeGoal throws other error", async () => {
      vi.mocked(writeGoal).mockRejectedValue(new Error("fs error"));
      const res = await PUT(
        new Request("https://test", { method: "PUT", body: JSON.stringify({ title: "T" }) }),
        { params: Promise.resolve({ id: "g1" }) }
      );
      expect(res.status).toBe(500);
    });
  });

  describe("DELETE /api/goals/[id]", () => {
    it("returns 200 when delete succeeds", async () => {
      vi.mocked(deleteGoal).mockResolvedValue({ ok: true });
      const res = await DELETE(new Request("https://test"), { params: Promise.resolve({ id: "g1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 404 when delete returns ok false", async () => {
      vi.mocked(deleteGoal).mockResolvedValue({ ok: false });
      const res = await DELETE(new Request("https://test"), { params: Promise.resolve({ id: "g1" }) });
      expect(res.status).toBe(404);
    });

    it("returns 400 when deleteGoal throws Invalid goal id", async () => {
      vi.mocked(deleteGoal).mockRejectedValue(new Error("Invalid goal id"));
      const res = await DELETE(new Request("https://test"), { params: Promise.resolve({ id: "bad" }) });
      expect(res.status).toBe(400);
    });

    it("returns 500 when deleteGoal throws other error", async () => {
      vi.mocked(deleteGoal).mockRejectedValue(new Error("fs error"));
      const res = await DELETE(new Request("https://test"), { params: Promise.resolve({ id: "g1" }) });
      expect(res.status).toBe(500);
    });
  });
});
