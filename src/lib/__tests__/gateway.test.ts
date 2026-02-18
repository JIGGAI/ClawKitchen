import { describe, expect, it, vi, beforeEach } from "vitest";
import { toolsInvoke, gatewayConfigGet, gatewayConfigPatch, getContentText } from "../gateway";

vi.mock("@/lib/paths", () => ({
  readOpenClawConfig: vi.fn(),
}));

import { readOpenClawConfig } from "@/lib/paths";

const mockFetch = vi.hoisted(() => vi.fn());

describe("gateway", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    vi.mocked(readOpenClawConfig).mockReset();
    mockFetch.mockReset();
    vi.stubEnv("OPENCLAW_GATEWAY_HTTP_URL", "");
    vi.stubEnv("OPENCLAW_GATEWAY_URL", "");
    vi.stubEnv("OPENCLAW_GATEWAY_TOKEN", "");
  });

  describe("toolsInvoke", () => {
    it("returns result when ok", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        gateway: { port: 18789, auth: { token: "test-token" } },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { foo: "bar" } }),
      });

      const r = await toolsInvoke({ tool: "test", action: "run" });
      expect(r).toEqual({ foo: "bar" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:18789/tools/invoke",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ authorization: "Bearer test-token" }),
          body: JSON.stringify({ tool: "test", action: "run" }),
        })
      );
    });

    it("throws when res.ok false", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        gateway: { auth: { token: "t" } },
      });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ ok: false, error: "Server error" }),
      });

      await expect(toolsInvoke({ tool: "x" })).rejects.toThrow("Server error");
    });

    it("throws when json.ok false", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        gateway: { auth: { token: "t" } },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: { message: "Tool failed" } }),
      });

      await expect(toolsInvoke({ tool: "x" })).rejects.toThrow("Tool failed");
    });

    it("throws when token missing", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({});

      await expect(toolsInvoke({ tool: "x" })).rejects.toThrow("Missing gateway token");
    });

    it("uses env token over config", async () => {
      vi.stubEnv("OPENCLAW_GATEWAY_TOKEN", "env-token");
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        gateway: { auth: { token: "config-token" } },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: {} }),
      });

      await toolsInvoke({ tool: "x" });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: "Bearer env-token" }),
        })
      );
    });
  });

  describe("getContentText", () => {
    it("returns text from content item with type text", () => {
      expect(getContentText([{ type: "text", text: "hello" }])).toBe("hello");
    });
    it("returns undefined when no text item", () => {
      expect(getContentText([{ type: "other" }])).toBeUndefined();
      expect(getContentText([])).toBeUndefined();
      expect(getContentText(undefined)).toBeUndefined();
    });
  });

  describe("gatewayConfigGet", () => {
    it("returns raw and hash from tool result", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        gateway: { auth: { token: "t" } },
      });
      const payload = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              result: { raw: '{"key":"val"}', hash: "abc123" },
            }),
          },
        ],
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: payload }),
      });

      const r = await gatewayConfigGet();
      expect(r).toEqual({ raw: '{"key":"val"}', hash: "abc123" });
    });

    it("throws when text payload missing", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        gateway: { auth: { token: "t" } },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: { content: [{ type: "other" }] },
        }),
      });

      await expect(gatewayConfigGet()).rejects.toThrow("gateway config.get: missing text payload");
    });

    it("throws when result.raw missing", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        gateway: { auth: { token: "t" } },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true, result: { hash: "x" } }),
              },
            ],
          },
        }),
      });

      await expect(gatewayConfigGet()).rejects.toThrow("gateway config.get: missing result.raw");
    });

    it("throws when result.hash missing", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        gateway: { auth: { token: "t" } },
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true, result: { raw: "{}" } }),
              },
            ],
          },
        }),
      });

      await expect(gatewayConfigGet()).rejects.toThrow("gateway config.get: missing result.hash");
    });
  });

  describe("gatewayConfigPatch", () => {
    it("calls toolsInvoke with patch and baseHash", async () => {
      vi.mocked(readOpenClawConfig).mockResolvedValue({
        gateway: { auth: { token: "t" } },
      });
      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      ok: true,
                      result: { raw: "{}", hash: "h1" },
                    }),
                  },
                ],
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, result: {} }),
        };
      });

      await gatewayConfigPatch({ newKey: "val" }, "Custom note");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const patchCall = mockFetch.mock.calls[1];
      const body = JSON.parse(patchCall[1].body as string);
      expect(body.args?.action).toBe("config.patch");
      expect(body.args?.baseHash).toBe("h1");
      expect(body.args?.note).toBe("Custom note");
    });
  });
});
