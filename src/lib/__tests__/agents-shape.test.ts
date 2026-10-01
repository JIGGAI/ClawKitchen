import { describe, expect, it } from "vitest";
import { detectAgentsShape, readAgents, readDefaultAgentId, withAgents } from "@/lib/agents-shape";

describe("agents-shape", () => {
  it("detects the keyed entries shape", () => {
    expect(detectAgentsShape({ agents: { entries: { main: {} } } })).toBe("entries");
  });

  it("detects the legacy list shape", () => {
    expect(detectAgentsShape({ agents: { list: [{ id: "main" }] } })).toBe("list");
  });

  it("defaults to entries when agents are absent or malformed", () => {
    expect(detectAgentsShape({})).toBe("entries");
    expect(detectAgentsShape(undefined)).toBe("entries");
    expect(detectAgentsShape({ agents: { list: null } as never })).toBe("entries");
  });

  it("normalizes entries into records carrying id", () => {
    expect(readAgents({ agents: { entries: { main: { workspace: "/ws" } } } })).toEqual([
      { id: "main", workspace: "/ws" },
    ]);
  });

  it("reads the legacy array unchanged", () => {
    expect(readAgents({ agents: { list: [{ id: "main", workspace: "/ws" }] } })).toEqual([
      { id: "main", workspace: "/ws" },
    ]);
  });

  it("drops agents without a usable id", () => {
    expect(readAgents({ agents: { list: [{ id: "" }, { workspace: "/ws" }, { id: "ok" }] } })).toEqual([{ id: "ok" }]);
  });

  it("is empty when there are no agents", () => {
    expect(readAgents({})).toEqual([]);
    expect(readAgents(undefined)).toEqual([]);
  });

  it("withAgents keys entries by id and strips the inline id", () => {
    const next = withAgents({ agents: { entries: { main: { workspace: "/old" } } } }, [
      { id: "main", workspace: "/new" },
      { id: "zoe", workspace: "/ws-zoe" },
    ]);
    expect(next.agents).toEqual({ entries: { main: { workspace: "/new" }, zoe: { workspace: "/ws-zoe" } } });
  });

  it("withAgents keeps the legacy array when that is the shape in use", () => {
    const next = withAgents({ agents: { list: [{ id: "main" }] } }, [{ id: "main", workspace: "/ws" }]);
    expect(next.agents).toEqual({ list: [{ id: "main", workspace: "/ws" }] });
  });

  it("withAgents drops a stale legacy array when writing entries", () => {
    // OpenClaw migrates a leftover agents.list back over agents.entries, so it must go.
    const next = withAgents({ agents: { entries: {}, list: [{ id: "stale" }] } }, [{ id: "main" }]);
    expect(next.agents?.list).toBeUndefined();
    expect(next.agents?.entries?.main).toEqual({});
  });

  it("withAgents preserves sibling keys such as defaults", () => {
    const next = withAgents({ agents: { defaults: { workspace: "/ws" }, entries: { main: {} } } }, [{ id: "main" }]);
    expect(next.agents?.defaults).toEqual({ workspace: "/ws" });
  });

  it("withAgents does not mutate its input", () => {
    const cfg = { agents: { entries: { main: { workspace: "/ws" } } } };
    const before = JSON.stringify(cfg);
    withAgents(cfg, [{ id: "other" }]);
    expect(JSON.stringify(cfg)).toBe(before);
  });

  it("readAgents/withAgents round-trip preserves nested settings", () => {
    const cfg = {
      agents: { entries: { main: { identity: { name: "Seven" }, model: { primary: "openai/gpt-5.6-sol" } } } },
    };
    expect(JSON.stringify(withAgents(cfg, readAgents(cfg)).agents)).toBe(JSON.stringify(cfg.agents));
  });

  it("readDefaultAgentId prefers agents.defaults.systemAgent.agentId", () => {
    expect(readDefaultAgentId({ agents: { defaults: { systemAgent: { agentId: "main" } }, entries: { main: {} } } })).toBe(
      "main"
    );
  });

  it("readDefaultAgentId falls back to a legacy default marker", () => {
    expect(readDefaultAgentId({ agents: { list: [{ id: "a" }, { id: "b", default: true }] } })).toBe("b");
  });

  it("readDefaultAgentId is undefined when nothing marks a default", () => {
    expect(readDefaultAgentId({ agents: { entries: { main: {} } } })).toBeUndefined();
  });
});
