// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSlugifiedId } from "../use-slugified-id";

describe("useSlugifiedId", () => {
  const mockSetName = vi.fn();
  const mockSetId = vi.fn();
  const mockSetIdTouched = vi.fn();

  beforeEach(() => {
    mockSetName.mockClear();
    mockSetId.mockClear();
    mockSetIdTouched.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns derivedId from slugified name", () => {
    const { result } = renderHook(() =>
      useSlugifiedId({
        open: true,
        name: "My Agent",
        setName: mockSetName,
        id: "",
        setId: mockSetId,
        idTouched: false,
        setIdTouched: mockSetIdTouched,
      })
    );
    expect(result.current.derivedId).toBe("my-agent");
  });

  it("returns effectiveId as derivedId when idTouched is false", () => {
    const { result } = renderHook(() =>
      useSlugifiedId({
        open: true,
        name: "Test Name",
        setName: mockSetName,
        id: "custom-id",
        setId: mockSetId,
        idTouched: false,
        setIdTouched: mockSetIdTouched,
      })
    );
    expect(result.current.effectiveId).toBe("test-name");
  });

  it("returns effectiveId as id when idTouched is true", () => {
    const { result } = renderHook(() =>
      useSlugifiedId({
        open: true,
        name: "Test Name",
        setName: mockSetName,
        id: "custom-id",
        setId: mockSetId,
        idTouched: true,
        setIdTouched: mockSetIdTouched,
      })
    );
    expect(result.current.effectiveId).toBe("custom-id");
  });

  it("syncs derivedId to id when open and !idTouched", () => {
    renderHook(() =>
      useSlugifiedId({
        open: true,
        name: "Hello World",
        setName: mockSetName,
        id: "",
        setId: mockSetId,
        idTouched: false,
        setIdTouched: mockSetIdTouched,
      })
    );
    expect(mockSetId).toHaveBeenCalledWith("hello-world");
  });

  it("resets form when modal closes (open becomes false)", () => {
    const { rerender } = renderHook(
      ({ open }) =>
        useSlugifiedId({
          open,
          name: "Test",
          setName: mockSetName,
          id: "test-id",
          setId: mockSetId,
          idTouched: true,
          setIdTouched: mockSetIdTouched,
        }),
      { initialProps: { open: true } }
    );

    act(() => {
      rerender({ open: false });
    });

    expect(mockSetIdTouched).toHaveBeenCalledWith(false);
    expect(mockSetName).toHaveBeenCalledWith("");
    expect(mockSetId).toHaveBeenCalledWith("");
  });

  it("uses custom slugify when provided", () => {
    const customSlugify = (s: string) => s.toUpperCase().replace(/\s/g, "_");
    const { result } = renderHook(() =>
      useSlugifiedId({
        open: true,
        name: "foo bar",
        setName: mockSetName,
        id: "",
        setId: mockSetId,
        idTouched: false,
        setIdTouched: mockSetIdTouched,
        slugify: customSlugify,
      })
    );
    expect(result.current.derivedId).toBe("FOO_BAR");
  });
});
