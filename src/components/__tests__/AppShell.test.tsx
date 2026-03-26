import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { AppShell } from "../AppShell";

// Get the global localStorage mock from test setup
const localStorageMock = (global as any).localStorageMock;

const mockUsePathname = vi.fn();
const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ replace: mockReplace, push: mockPush, refresh: mockRefresh }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/fetch-json", () => ({
  fetchJson: vi.fn(async () => ({ teams: [{ id: "claw-marketing-team" }, { id: "development-team" }] })),
}));

describe("AppShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/");
    mockReplace.mockReset();
    mockPush.mockReset();
    mockRefresh.mockReset();
    // Reset localStorage mock
    localStorageMock.clear.mockReset();
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
    localStorageMock.removeItem.mockReset();
    localStorageMock.clear();
  });

  it.skip("keeps server markup free of the team-scoped Edit team link, then restores it after hydration from localStorage", async () => {
    localStorageMock.getItem.mockReturnValue("claw-marketing-team");
    window.localStorage.setItem("ck-selected-team", "claw-marketing-team");

    const serverHtml = renderToString(
      <AppShell>
        <div>child</div>
      </AppShell>
    );
    expect(serverHtml).not.toContain("Edit team");

    render(
      <AppShell>
        <div>child</div>
      </AppShell>
    );

    await waitFor(() => {
      expect(screen.getByText("Edit team")).toBeTruthy();
    });

    const link = screen.getByText("Edit team").closest("a");
    expect(link?.getAttribute("href")).toBe("/teams/claw-marketing-team");
  });
});
