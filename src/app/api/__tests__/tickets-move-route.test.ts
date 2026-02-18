import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "../tickets/move/route";

const mockExecFileAsync = vi.hoisted(() => vi.fn());

vi.mock("@/lib/exec", () => ({
  execFileAsync: (...args: unknown[]) => mockExecFileAsync(...args),
}));

describe("api tickets move route", () => {
  beforeEach(() => {
    mockExecFileAsync.mockReset();
  });

  it("returns 400 when ticket missing", async () => {
    const res = await POST(new Request("https://test", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing ticket");
  });

  it("returns 400 when destination invalid", async () => {
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ ticket: "T-1", to: "invalid" }),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid destination stage");
  });

  it("returns 200 when move succeeds", async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ ticket: "T-1", to: "in-progress" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      "openclaw",
      expect.arrayContaining(["recipes", "move-ticket", "--ticket", "T-1", "--to", "in-progress"]),
      expect.any(Object)
    );
  });

  it("returns 500 when exec fails", async () => {
    mockExecFileAsync.mockRejectedValue(new Error("Command failed"));
    const res = await POST(
      new Request("https://test", {
        method: "POST",
        body: JSON.stringify({ ticket: "T-1", to: "done" }),
      })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Command failed");
  });
});
