// @vitest-environment node

import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { patchOpenClawConfigFile, readOpenClawConfigRaw, redactChannels } from "@/lib/openclaw-config";

describe("openclaw-config (integration)", () => {
  it("readOpenClawConfigRaw reads from HOME/.openclaw/openclaw.json", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-config-test-"));
    process.env.HOME = home;

    const dir = path.join(home, ".openclaw");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "openclaw.json"), JSON.stringify({ channels: { telegram: { botToken: "x" } } }, null, 2));

    const res = await readOpenClawConfigRaw();
    expect(res.path).toBe(path.join(dir, "openclaw.json"));
    expect(res.hash).toMatch(/^[a-f0-9]{64}$/);

    const json = res.json as unknown as { channels: { telegram: { botToken: string } } };
    expect(json.channels.telegram.botToken).toBe("x");
  });

  it("redactChannels redacts secrets", () => {
    const out = redactChannels({ telegram: { botToken: "secret", nested: { token: "abc" } } }) as unknown as {
      telegram: { botToken: string; nested: { token: string } };
    };

    expect(out.telegram.botToken).toBe("__OPENCLAW_REDACTED__");
    expect(out.telegram.nested.token).toBe("__OPENCLAW_REDACTED__");
  });

  it("patchOpenClawConfigFile updates channels and writes breadcrumb", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-config-test-"));
    process.env.HOME = home;

    const dir = path.join(home, ".openclaw");
    await fs.mkdir(dir, { recursive: true });
    const cfgPath = path.join(dir, "openclaw.json");
    await fs.writeFile(cfgPath, JSON.stringify({ channels: { slack: { x: 1 } } }, null, 2) + "\n", "utf8");

    const r = await patchOpenClawConfigFile({
      note: "test-note",
      patch: (prev) => {
        const prevChannels = prev.channels && typeof prev.channels === "object" ? (prev.channels as Record<string, unknown>) : {};
        return { ...prev, channels: { ...prevChannels, telegram: { enabled: true } } };
      },
    });

    expect(r.ok).toBe(true);

    const after = JSON.parse(await fs.readFile(cfgPath, "utf8")) as { channels: Record<string, unknown> };
    expect(after.channels.slack).toEqual({ x: 1 });
    expect(after.channels.telegram).toEqual({ enabled: true });

    const breadcrumb = await fs.readFile(path.join(dir, "notes", "kitchen-config.log"), "utf8");
    expect(breadcrumb).toContain("test-note");
  });
});
