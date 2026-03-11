import { describe, expect, it } from "vitest";

import { parseEnabledPluginIds } from "@/lib/plugins";

describe("parseEnabledPluginIds", () => {
  it("returns enabled plugin ids from the verbose plugins-list object shape", () => {
    const stdout = JSON.stringify({
      workspaceDir: "/home/control/.openclaw/workspace",
      plugins: [
        { id: "kitchen", enabled: true },
        { id: "llm-task", enabled: true },
        { id: "lobster", enabled: false }
      ]
    });

    expect(parseEnabledPluginIds(stdout)).toEqual(["kitchen", "llm-task"]);
  });

  it("still supports the legacy top-level array shape", () => {
    const stdout = JSON.stringify([
      { id: "recipes", enabled: true },
      { id: "discord", enabled: false }
    ]);

    expect(parseEnabledPluginIds(stdout)).toEqual(["recipes"]);
  });
});
