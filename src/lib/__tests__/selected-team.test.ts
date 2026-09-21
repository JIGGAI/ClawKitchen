import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectTeam } from "@/lib/selected-team";

describe("selectTeam", () => {
  let store: Map<string, string>;
  let events: string[];

  beforeEach(() => {
    store = new Map();
    events = [];
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    vi.stubGlobal("window", { dispatchEvent: (e: Event) => events.push(e.type) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists the team and notifies subscribers", () => {
    selectTeam("hmx-social-team");
    expect(store.get("ck-selected-team")).toBe("hmx-social-team");
    expect(events).toEqual(["ck-selected-team-changed"]);
  });

  it("clears the selection for an empty id", () => {
    store.set("ck-selected-team", "old");
    selectTeam("");
    expect(store.has("ck-selected-team")).toBe(false);
    expect(events).toEqual(["ck-selected-team-changed"]);
  });
});
