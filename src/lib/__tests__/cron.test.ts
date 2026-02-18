import { describe, expect, it } from "vitest";
import { cronJobId, cronJobLabel, fmtCronSchedule } from "../cron";

describe("cronJobId", () => {
  it("returns id when present", () => {
    expect(cronJobId({ id: "j1" })).toBe("j1");
  });

  it("returns jobId when id missing", () => {
    expect(cronJobId({ jobId: "j2" })).toBe("j2");
  });

  it("returns empty string when both missing", () => {
    expect(cronJobId({})).toBe("");
  });
});

describe("cronJobLabel", () => {
  it("returns name when present", () => {
    expect(cronJobLabel({ name: "Daily sync" })).toBe("Daily sync");
  });

  it("falls back to id then jobId", () => {
    expect(cronJobLabel({ id: "j1" })).toBe("j1");
    expect(cronJobLabel({ jobId: "j2" })).toBe("j2");
  });

  it("returns (unnamed) when all missing", () => {
    expect(cronJobLabel({})).toBe("(unnamed)");
  });
});

describe("fmtCronSchedule", () => {
  it("returns cron expr when kind is cron", () => {
    expect(fmtCronSchedule({ kind: "cron", expr: "0 * * * *" })).toBe("0 * * * *");
  });

  it("returns minutes when kind is every and everyMs", () => {
    expect(fmtCronSchedule({ kind: "every", everyMs: 300000 })).toBe("every 5m");
  });

  it("returns empty for undefined", () => {
    expect(fmtCronSchedule(undefined)).toBe("");
  });
});
