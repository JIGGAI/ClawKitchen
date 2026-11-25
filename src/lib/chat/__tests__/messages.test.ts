import { describe, expect, it } from "vitest";
import {
  isChatSessionKey,
  mainSessionKey,
  textOf,
  toAgentStreamEvent,
  toChatMessages,
  toStreamEvent,
  toThreads,
} from "@/lib/chat/messages";

describe("isChatSessionKey", () => {
  it.each([
    ["agent:main:main", true],
    ["agent:hmx-social-team-lead:dashboard:3f2a-9c", true],
    ["agent:main:telegram:direct:123", false],
    ["agent:main:cron:abc", false],
    ["agent:main:dashboard:", false],
    ["agent:../x:main", false],
    ["main", false],
    [42, false],
  ])("%s -> %s", (key, expected) => {
    expect(isChatSessionKey(key)).toBe(expected);
  });
});

describe("textOf / toChatMessages", () => {
  it("reads string and block content", () => {
    expect(textOf("hi")).toBe("hi");
    expect(textOf([{ type: "text", text: "a" }, { type: "toolCall", name: "x" }, { type: "text", text: "b" }])).toBe("a\n\nb");
    expect(textOf(undefined)).toBe("");
  });

  it("keeps text, reasoning, tool calls, results, and prepared activity", () => {
    const out = toChatMessages(
      [
        { role: "user", content: "Reply with just: pong", timestamp: 1, __openclaw: { id: "u1" } },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "I should inspect it." },
            { type: "toolCall", id: "call-1", name: "exec", arguments: { command: "pwd" } },
          ],
          timestamp: 2,
          __openclaw: { id: "a-tool" },
        },
        { role: "toolResult", toolCallId: "call-1", toolName: "exec", content: [{ type: "text", text: "ok" }] },
        { role: "assistant", content: [{ type: "text", text: "pong" }], timestamp: 3, __openclaw: { id: "a1" } },
      ],
      [{ messageId: "a-tool", items: [{ itemId: "i1", toolCallId: "call-1", name: "exec", title: "Run command", status: "completed" }] }],
    );
    expect(out).toEqual([
      {
        id: "u1",
        role: "user",
        text: "Reply with just: pong",
        blocks: [{ type: "text", text: "Reply with just: pong" }],
        ts: 1,
      },
      {
        id: "a-tool",
        role: "assistant",
        text: "",
        blocks: [
          { type: "thinking", text: "I should inspect it." },
          {
            type: "tool_call",
            id: "call-1",
            name: "exec",
            title: "Run command",
            input: '{\n  "command": "pwd"\n}',
            output: "ok",
            isError: false,
            status: "completed",
          },
        ],
        ts: 2,
      },
      {
        id: "a1",
        role: "assistant",
        text: "pong",
        blocks: [{ type: "text", text: "pong" }],
        ts: 3,
      },
    ]);
  });
});

describe("toThreads", () => {
  it("pins Main (synthesized when missing) and lists only this agent's dashboard threads, newest first", () => {
    const threads = toThreads("main", [
      { key: "agent:main:telegram:direct:1", updatedAt: 9 },
      { key: "agent:main:dashboard:old", label: "Old", updatedAt: 1 },
      { key: "agent:main:dashboard:new", derivedTitle: "Hello there", lastMessagePreview: "hi", updatedAt: 5, hasActiveRun: true },
      { key: "agent:other:dashboard:x", updatedAt: 7 },
    ]);
    expect(threads).toEqual([
      { key: mainSessionKey("main"), title: "Main", preview: null, updatedAt: null, running: false, primary: true },
      { key: "agent:main:dashboard:new", title: "Hello there", preview: "hi", updatedAt: 5, running: true, primary: false },
      { key: "agent:main:dashboard:old", title: "Old", preview: null, updatedAt: 1, running: false, primary: false },
    ]);
  });

  it("uses the real Main row when it exists", () => {
    const [main] = toThreads("a", [{ key: "agent:a:main", lastMessagePreview: "yo", updatedAt: 3 }]);
    expect(main).toMatchObject({ key: "agent:a:main", title: "Main", preview: "yo", updatedAt: 3 });
  });
});

describe("stream events", () => {
  it("maps chat event states", () => {
    expect(toStreamEvent({ runId: "r", state: "delta", message: { content: [{ type: "text", text: "po" }] } })).toEqual({
      type: "delta",
      runId: "r",
      text: "po",
    });
    expect(toStreamEvent({ runId: "r", state: "final" })).toEqual({ type: "final", runId: "r" });
    expect(toStreamEvent({ state: "aborted" })).toEqual({ type: "aborted", runId: null });
    expect(toStreamEvent({ runId: "r", state: "error", errorMessage: "boom" })).toEqual({ type: "error", runId: "r", message: "boom" });
    expect(toStreamEvent({ state: "other" })).toBeNull();
    expect(toStreamEvent(null)).toBeNull();
  });

  it("maps live thinking and tool activity", () => {
    expect(
      toAgentStreamEvent({
        runId: "r",
        stream: "thinking",
        data: { itemId: "think-1", phase: "delta", text: "Checking files" },
      }),
    ).toEqual({ type: "thinking", runId: "r", itemId: "think-1", text: "Checking files" });

    expect(
      toAgentStreamEvent({
        runId: "r",
        stream: "tool",
        data: { phase: "start", toolCallId: "call-1", name: "exec", args: { command: "pwd" } },
      }),
    ).toEqual({
      type: "activity",
      runId: "r",
      activity: {
        id: "call-1",
        name: "exec",
        title: "exec",
        phase: "start",
        status: "running",
        input: '{\n  "command": "pwd"\n}',
        output: null,
        isError: false,
      },
    });
  });
});
