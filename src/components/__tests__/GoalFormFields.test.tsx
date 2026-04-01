// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { GoalFormCard, GoalFormFields, type GoalFormState } from "../GoalFormFields";

function makeFormState(overrides?: Partial<GoalFormState>): GoalFormState {
  return {
    title: "",
    setTitle: vi.fn(),
    status: "planned",
    setStatus: vi.fn(),
    tagsRaw: "",
    setTagsRaw: vi.fn(),
    teamsRaw: "",
    setTeamsRaw: vi.fn(),
    body: "",
    setBody: vi.fn(),
    ...overrides,
  };
}

describe("GoalFormCard", () => {
  it("renders children and actions", () => {
    render(
      <GoalFormCard error={null} actions={<button>Save</button>}>
        <div data-testid="child">Form content</div>
      </GoalFormCard>
    );
    expect(screen.getByTestId("child").textContent).toBe("Form content");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("shows error when provided", () => {
    render(
      <GoalFormCard error="Something went wrong" actions={<button>Save</button>}>
        <div>Content</div>
      </GoalFormCard>
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("hides error when null", () => {
    render(
      <GoalFormCard error={null} actions={<button>Save</button>}>
        <div data-testid="content">Content</div>
      </GoalFormCard>
    );
    expect(screen.getByTestId("content")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});

describe("GoalFormFields", () => {
  it("renders title, status, tags, teams, body inputs", () => {
    const formState = makeFormState({ title: "My goal", body: "Body text" });
    render(<GoalFormFields formState={formState} />);

    expect((screen.getByPlaceholderText("Goal title") as HTMLInputElement).value).toBe("My goal");
    const textarea = screen.getByPlaceholderText("Write the goal here…");
    expect((textarea as HTMLTextAreaElement).value).toBe("Body text");
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("renders id field when idField provided", () => {
    const setId = vi.fn();
    const formState = makeFormState();
    render(
      <GoalFormFields
        formState={formState}
        idField={{ id: "my-id", setId, suggestedId: "suggested-id" }}
      />
    );
    expect((screen.getByPlaceholderText("increase-trial-activation") as HTMLInputElement).value).toBe("my-id");
  });

  it("shows suggested id button when id is empty", () => {
    const setId = vi.fn();
    const formState = makeFormState();
    render(
      <GoalFormFields
        formState={formState}
        idField={{ id: "", setId, suggestedId: "suggested-id" }}
      />
    );
    expect(screen.getByText("suggested-id")).toBeTruthy();
  });

  it("clicking suggested id button calls setId", () => {
    const setId = vi.fn();
    const formState = makeFormState();
    render(
      <GoalFormFields
        formState={formState}
        idField={{ id: "", setId, suggestedId: "suggested-id" }}
      />
    );
    fireEvent.click(screen.getByText("suggested-id"));
    expect(setId).toHaveBeenCalledWith("suggested-id");
  });

  it("calls setTitle when title input changes", () => {
    const setTitle = vi.fn();
    const formState = makeFormState({ setTitle });
    render(<GoalFormFields formState={formState} />);
    fireEvent.change(screen.getByPlaceholderText("Goal title"), { target: { value: "x" } });
    expect(setTitle).toHaveBeenCalledWith("x");
  });

  it("calls setStatus when status select changes", () => {
    const setStatus = vi.fn();
    const formState = makeFormState({ setStatus });
    render(<GoalFormFields formState={formState} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "active" } });
    expect(setStatus).toHaveBeenCalledWith("active");
  });
});
