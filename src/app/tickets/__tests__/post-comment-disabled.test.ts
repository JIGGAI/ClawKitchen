import { describe, expect, it } from "vitest";
import { isPostCommentDisabled } from "../TicketDetailClient";

describe("TicketDetailClient comment composer", () => {
  it("disables when body is empty", () => {
    expect(isPostCommentDisabled("", false)).toBe(true);
    expect(isPostCommentDisabled("   ", false)).toBe(true);
  });

  it("disables while pending", () => {
    expect(isPostCommentDisabled("hi", true)).toBe(true);
  });

  it("enables when body has non-whitespace and not pending", () => {
    expect(isPostCommentDisabled("hi", false)).toBe(false);
  });
});
