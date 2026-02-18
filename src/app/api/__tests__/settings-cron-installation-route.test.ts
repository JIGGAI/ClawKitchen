import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, PUT } from "../settings/cron-installation/route";

vi.mock("@/lib/gateway", () => ({
  gatewayConfigGet: vi.fn(),
  gatewayConfigPatch: vi.fn(),
}));

import { gatewayConfigGet, gatewayConfigPatch } from "@/lib/gateway";

describe("api settings cron-installation route", () => {
  beforeEach(() => {
    vi.mocked(gatewayConfigGet).mockReset();
    vi.mocked(gatewayConfigPatch).mockReset();

    vi.mocked(gatewayConfigGet).mockResolvedValue({
      raw: JSON.stringify({
        plugins: {
          entries: { recipes: { config: { cronInstallation: "prompt" } } },
        },
      }),
      hash: "abc",
    });
    vi.mocked(gatewayConfigPatch).mockResolvedValue(undefined);
  });

  describe("GET", () => {
    it("returns path and value", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.path).toBe("plugins.entries.recipes.config.cronInstallation");
      expect(json.value).toBe("prompt");
    });
  });

  describe("PUT", () => {
    it("returns 400 when value invalid", async () => {
      const r1 = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ value: "invalid" }),
        })
      );
      expect(r1.status).toBe(400);
      expect((await r1.json()).error).toContain("off|prompt|on");

      const r2 = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({}),
        })
      );
      expect(r2.status).toBe(400);
    });

    it("returns ok and patches on valid value", async () => {
      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ value: "on" }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.value).toBe("on");
      expect(gatewayConfigPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: {
            entries: {
              recipes: {
                config: { cronInstallation: "on" },
              },
            },
          },
        }),
        expect.any(String)
      );
    });
  });
});
