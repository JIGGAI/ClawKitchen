// @vitest-environment node

import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, PUT, DELETE } from "../channels/bindings/route";

vi.mock("@/lib/openclaw-config", () => ({
  readOpenClawConfigRaw: vi.fn(),
  redactChannels: (channels: unknown) => channels,
  patchOpenClawConfigFile: vi.fn(),
}));

import { readOpenClawConfigRaw, patchOpenClawConfigFile } from "@/lib/openclaw-config";

type PatchCall = {
  note?: string;
  patch: (prev: { channels?: Record<string, unknown> }) => { channels?: Record<string, unknown> };
};

describe("api channels bindings route", () => {
  beforeEach(() => {
    vi.mocked(readOpenClawConfigRaw).mockReset();
    vi.mocked(patchOpenClawConfigFile).mockReset();

    vi.mocked(readOpenClawConfigRaw).mockResolvedValue({
      path: "/home/test/.openclaw/openclaw.json",
      raw: JSON.stringify({ channels: { telegram: { botToken: "x" } }, bindings: [] }),
      hash: "abc",
      json: { channels: { telegram: { botToken: "x" } }, bindings: [] },
    } as never);

    vi.mocked(patchOpenClawConfigFile).mockResolvedValue({ ok: true, path: "/home/test/.openclaw/openclaw.json", hash: "def" } as never);
  });

  describe("GET", () => {
    it("returns channels and hash", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.channels).toEqual({ telegram: { botToken: "x" } });
      expect(json.hash).toBe("abc");
      expect(json.bindings).toEqual([]);
    });

    it("returns 500 when config read throws", async () => {
      vi.mocked(readOpenClawConfigRaw).mockRejectedValue(new Error("read error"));
      const res = await GET();
      expect(res.status).toBe(500);
    });
  });

  describe("PUT", () => {
    it("returns 400 when provider or config missing", async () => {
      const r1 = await PUT(new Request("https://test", { method: "PUT", body: JSON.stringify({}) }));
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
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.restartRequired).toBe(true);

      expect(patchOpenClawConfigFile).toHaveBeenCalledTimes(1);
      const call = vi.mocked(patchOpenClawConfigFile).mock.calls[0]![0] as unknown as PatchCall;
      expect(String(call.note)).toContain("telegram");
      const next = call.patch({ channels: { slack: { x: 1 } } });
      expect(next.channels).toEqual({ slack: { x: 1 }, telegram: { botToken: "secret" } });
    });

    it("returns 500 when patchOpenClawConfigFile throws", async () => {
      vi.mocked(patchOpenClawConfigFile).mockRejectedValue(new Error("patch error"));
      const res = await PUT(
        new Request("https://test", {
          method: "PUT",
          body: JSON.stringify({ provider: "slack", config: {} }),
        })
      );
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("patch error");
    });
  });

  describe("DELETE", () => {
    it("returns 400 when provider missing", async () => {
      const res = await DELETE(new Request("https://test", { method: "DELETE", body: JSON.stringify({}) }));
      expect(res.status).toBe(400);
    });

    it("returns ok and removes provider", async () => {
      const res = await DELETE(
        new Request("https://test", {
          method: "DELETE",
          body: JSON.stringify({ provider: "telegram" }),
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.restartRequired).toBe(true);

      expect(patchOpenClawConfigFile).toHaveBeenCalledTimes(1);
      const call = vi.mocked(patchOpenClawConfigFile).mock.calls[0]![0] as unknown as PatchCall;
      const next = call.patch({ channels: { telegram: { botToken: "x" }, slack: { y: 2 } } });
      expect(next.channels).toEqual({ slack: { y: 2 } });
    });

    it("returns 500 when patchOpenClawConfigFile throws", async () => {
      vi.mocked(patchOpenClawConfigFile).mockRejectedValue(new Error("patch error"));
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
