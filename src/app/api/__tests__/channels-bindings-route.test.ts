import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, PUT, DELETE } from "../channels/bindings/route";

vi.mock("@/lib/gateway", () => ({
  gatewayConfigGet: vi.fn(),
  gatewayConfigPatch: vi.fn(),
}));

import { gatewayConfigGet, gatewayConfigPatch } from "@/lib/gateway";

describe("api channels bindings route", () => {
  beforeEach(() => {
    vi.mocked(gatewayConfigGet).mockReset();
    vi.mocked(gatewayConfigPatch).mockReset();

    vi.mocked(gatewayConfigGet).mockResolvedValue({
      raw: JSON.stringify({ channels: { telegram: { botToken: "x" } } }),
      hash: "abc",
    });
    vi.mocked(gatewayConfigPatch).mockResolvedValue(undefined);
  });

  describe("GET", () => {
    it("returns channels and hash", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.channels).toEqual({ telegram: { botToken: "x" } });
      expect(json.hash).toBe("abc");
    });

    it("returns empty channels when invalid JSON", async () => {
      vi.mocked(gatewayConfigGet).mockResolvedValue({
        raw: "not json",
        hash: "x",
      });
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.channels).toEqual({});
    });

    it("returns 500 when gateway throws", async () => {
      vi.mocked(gatewayConfigGet).mockRejectedValue(new Error("Gateway error"));
      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  describe("PUT", () => {
    it("returns 400 when provider or config missing", async () => {
      const r1 = await PUT(
        new Request("https://test", { method: "PUT", body: JSON.stringify({}) })
      );
      expect(r1.status).toBe(400);
      expect((await r1.json()).error).toBe("provider is required");

      const r2 = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ provider: "tg", config: "not-object" }),
        })
      );
      expect(r2.status).toBe(400);
      expect((await r2.json()).error).toBe("config must be an object");
    });

    it("returns 400 when telegram config lacks botToken", async () => {
      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ provider: "telegram", config: {} }),
        })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("telegram.botToken is required");
    });

    it("returns ok and patches on success", async () => {
      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({
            provider: "telegram",
            config: { botToken: "secret" },
          }),
        })
      );
      expect(res.status).toBe(200);
      expect(gatewayConfigPatch).toHaveBeenCalledWith(
        { channels: { telegram: { botToken: "secret" } } },
        expect.stringContaining("telegram")
      );
    });

    it("returns 500 when gatewayConfigPatch throws", async () => {
      vi.mocked(gatewayConfigPatch).mockRejectedValue(new Error("Gateway error"));
      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ provider: "slack", config: {} }),
        })
      );
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("Gateway error");
    });
  });

  describe("DELETE", () => {
    it("returns 400 when provider missing", async () => {
      const res = await DELETE(
        new Request("https://test", { method: "DELETE", body: JSON.stringify({}) })
      );
      expect(res.status).toBe(400);
    });

    it("returns ok and patches provider to null", async () => {
      const res = await DELETE(
        new Request("https://test", {
          method: "DELETE",
          body: JSON.stringify({ provider: "telegram" }),
        })
      );
      expect(res.status).toBe(200);
      expect(gatewayConfigPatch).toHaveBeenCalledWith(
        { channels: { telegram: null } },
        expect.stringContaining("telegram")
      );
    });

    it("returns 500 when gatewayConfigPatch throws", async () => {
      vi.mocked(gatewayConfigPatch).mockRejectedValue(new Error("Gateway error"));
      const res = await DELETE(
        new Request("https://test", {
          method: "DELETE",
          body: JSON.stringify({ provider: "telegram" }),
        })
      );
      expect(res.status).toBe(500);
    });
  });
});
