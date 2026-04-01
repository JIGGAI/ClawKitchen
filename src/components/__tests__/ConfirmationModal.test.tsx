// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ConfirmationModal } from "../ConfirmationModal";

afterEach(cleanup);

describe("ConfirmationModal", () => {
  it("returns null when open is false", () => {
    render(
      <ConfirmationModal
        open={false}
        onClose={vi.fn()}
        title="Confirm"
        confirmLabel="Confirm"
        onConfirm={vi.fn()}
      >
        <p>Body content</p>
      </ConfirmationModal>
    );
    expect(screen.queryByText("Confirm")).toBeNull();
  });

  it("renders title, body, Cancel and Confirm when open", () => {
    render(
      <ConfirmationModal
        open={true}
        onClose={vi.fn()}
        title="Delete item?"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
      >
        <p>Are you sure?</p>
      </ConfirmationModal>
    );
    expect(screen.getByText("Delete item?")).toBeTruthy();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("calls onClose when Cancel clicked", () => {
    const onClose = vi.fn();
    render(
      <ConfirmationModal
        open={true}
        onClose={onClose}
        title="Confirm Close"
        confirmLabel="OK"
        onConfirm={vi.fn()}
      >
        <p>Body</p>
      </ConfirmationModal>
    );
    const modal = screen.getByText("Confirm Close").closest(".rounded-2xl");
    fireEvent.click(within(modal!).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onConfirm when Confirm clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal
        open={true}
        onClose={vi.fn()}
        title="Confirm Submit"
        confirmLabel="Submit"
        onConfirm={onConfirm}
      >
        <p>Body</p>
      </ConfirmationModal>
    );
    const modal = screen.getByText("Confirm Submit").closest(".rounded-2xl");
    fireEvent.click(within(modal!).getByRole("button", { name: "Submit" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("shows error when provided", () => {
    render(
      <ConfirmationModal
        open={true}
        onClose={vi.fn()}
        title="Confirm"
        confirmLabel="Confirm"
        onConfirm={vi.fn()}
        error="Something failed"
      >
        <p>Body</p>
      </ConfirmationModal>
    );
    expect(screen.getByText("Something failed")).toBeTruthy();
  });

  it("shows confirmBusyLabel when busy", () => {
    render(
      <ConfirmationModal
        open={true}
        onClose={vi.fn()}
        title="Confirm"
        confirmLabel="Confirm"
        confirmBusyLabel="Confirming…"
        onConfirm={vi.fn()}
        busy={true}
      >
        <p>Body</p>
      </ConfirmationModal>
    );
    expect(screen.getByRole("button", { name: "Confirming…" })).toBeTruthy();
  });
});
