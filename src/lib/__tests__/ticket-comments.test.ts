import { describe, expect, it } from "vitest";

import { parseTicketComments } from "@/lib/ticket-comments";

describe("parseTicketComments", () => {
  it("extracts author name + role from parenthetical format", () => {
    const md = `# T\n\n## Comments\n- **2026-03-10 00:00 UTC** — RJ (lead):\n  Hello\n`;
    const [c] = parseTicketComments(md);
    expect(c.authorName).toBe("RJ");
    expect(c.authorRole).toBe("lead");
    expect(c.body).toContain("Hello");
  });

  it("extracts author name + role from separator format", () => {
    const md = `# T\n\n## Comments\n- **2026-03-10 00:00 UTC** — dev — Seven:\n  Ship it\n`;
    const [c] = parseTicketComments(md);
    expect(c.authorName).toBe("Seven");
    expect(c.authorRole).toBe("dev");
  });

  it("keeps single-field authors as name only", () => {
    const md = `# T\n\n## Comments\n- **2026-03-10 00:00 UTC** — unknown:\n  Hi\n`;
    const [c] = parseTicketComments(md);
    expect(c.authorName).toBe("unknown");
    expect(c.authorRole).toBeUndefined();
  });
});
