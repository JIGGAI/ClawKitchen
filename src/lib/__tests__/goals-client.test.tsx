import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useGoalFormState } from "@/lib/goals-client";

function TestHarness({ initialTagsRaw }: { initialTagsRaw?: string }) {
  const { formState, tags, teams } = useGoalFormState({
    title: "T0",
    status: "planned",
    tagsRaw: initialTagsRaw ?? "a, b",
    teamsRaw: "dev-team, marketing",
    body: "hello",
  });

  return (
    <div>
      <div data-testid="title">{formState.title}</div>
      <div data-testid="status">{formState.status}</div>
      <div data-testid="tags">{tags.join("|")}</div>
      <div data-testid="teams">{teams.join("|")}</div>

      <input
        aria-label="title-input"
        value={formState.title}
        onChange={(e) => formState.setTitle(e.target.value)}
      />

      <button type="button" onClick={() => formState.setStatus("done")}>
        set-done
      </button>

      <input
        aria-label="tags-input"
        value={formState.tagsRaw}
        onChange={(e) => formState.setTagsRaw(e.target.value)}
      />

      <input
        aria-label="teams-input"
        value={formState.teamsRaw}
        onChange={(e) => formState.setTeamsRaw(e.target.value)}
      />
    </div>
  );
}

describe("useGoalFormState", () => {
  it("returns derived tags/teams and updates when raw strings change", () => {
    render(<TestHarness />);

    expect(screen.getByTestId("title").textContent).toBe("T0");
    expect(screen.getByTestId("status").textContent).toBe("planned");
    expect(screen.getByTestId("tags").textContent).toBe("a|b");
    expect(screen.getByTestId("teams").textContent).toBe("dev-team|marketing");

    fireEvent.change(screen.getByLabelText("title-input"), { target: { value: "T1" } });
    expect(screen.getByTestId("title").textContent).toBe("T1");

    fireEvent.click(screen.getByText("set-done"));
    expect(screen.getByTestId("status").textContent).toBe("done");

    fireEvent.change(screen.getByLabelText("tags-input"), { target: { value: "x, y,  " } });
    expect(screen.getByTestId("tags").textContent).toBe("x|y");

    fireEvent.change(screen.getByLabelText("teams-input"), { target: { value: "" } });
    expect(screen.getByTestId("teams").textContent).toBe("");
  });
});
