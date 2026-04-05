// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { FileListWithOptionalToggle } from "../FileListWithOptionalToggle";

const files = [
  { name: "SOUL.md", missing: false, required: true },
  { name: "AGENTS.md", missing: true, required: false },
  { name: "USER.md", missing: false, required: false },
];

describe("FileListWithOptionalToggle", () => {
  it("renders title and file list", () => {
    render(
      <FileListWithOptionalToggle
        title="Agent files"
        files={files}
        showOptionalFiles={true}
        onShowOptionalChange={vi.fn()}
        selectedFileName=""
        onSelectFile={vi.fn()}
      />
    );
    expect(screen.getByText("Agent files")).toBeTruthy();
    expect(screen.getByText("SOUL.md")).toBeTruthy();
    expect(screen.getByText("AGENTS.md")).toBeTruthy();
    expect(screen.getByText("USER.md")).toBeTruthy();
  });

  it("filters optional missing files when showOptionalFiles is false", () => {
    const { container } = render(
      <FileListWithOptionalToggle
        title="Filtered Files"
        files={files}
        showOptionalFiles={false}
        onShowOptionalChange={vi.fn()}
        selectedFileName=""
        onSelectFile={vi.fn()}
      />
    );
    expect(container.textContent).toContain("SOUL.md");
    expect(container.textContent).toContain("USER.md");
    expect(container.textContent).not.toContain("AGENTS.md");
  });

  it("shows all files when showOptionalFiles is true", () => {
    const { container } = render(
      <FileListWithOptionalToggle
        title="All Files"
        files={files}
        showOptionalFiles={true}
        onShowOptionalChange={vi.fn()}
        selectedFileName=""
        onSelectFile={vi.fn()}
      />
    );
    expect(container.textContent).toContain("AGENTS.md");
  });

  it("calls onSelectFile when file clicked", () => {
    const onSelectFile = vi.fn();
    render(
      <FileListWithOptionalToggle
        title="Click Files"
        files={files}
        showOptionalFiles={true}
        onShowOptionalChange={vi.fn()}
        selectedFileName=""
        onSelectFile={onSelectFile}
      />
    );
    const buttons = screen.getAllByRole("button");
    const soulButton = buttons.find((b) => b.textContent?.includes("SOUL.md"));
    fireEvent.click(soulButton!);
    expect(onSelectFile).toHaveBeenCalledWith("SOUL.md");
  });

  it("calls onShowOptionalChange when checkbox toggled", () => {
    const onShowOptionalChange = vi.fn();
    render(
      <FileListWithOptionalToggle
        title="Files"
        files={files}
        showOptionalFiles={false}
        onShowOptionalChange={onShowOptionalChange}
        selectedFileName=""
        onSelectFile={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onShowOptionalChange).toHaveBeenCalledWith(true);
  });

  it("shows Loading… when loading", () => {
    render(
      <FileListWithOptionalToggle
        title="Files"
        files={[]}
        loading={true}
        showOptionalFiles={true}
        onShowOptionalChange={vi.fn()}
        selectedFileName=""
        onSelectFile={vi.fn()}
      />
    );
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});
