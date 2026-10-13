import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  listWorkspaceDir,
  normalizeWorkspaceDir,
  isEditableWorkspaceFile,
  MAX_EDITABLE_BYTES,
} from "@/lib/workspace-tree";

// A throwaway workspace with the shapes the Files tab has to cope with:
// scaffold files at the root, nested folders, a hidden secrets dir, a binary,
// and a symlink that points outside the workspace.
let root = "";
let outside = "";

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ck-ws-"));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), "ck-outside-"));
  await fs.writeFile(path.join(root, "TEAM.md"), "# team\n");
  await fs.writeFile(path.join(root, "BRAND.md"), "# brand\n");
  await fs.mkdir(path.join(root, "shared-context", "templates"), { recursive: true });
  await fs.writeFile(path.join(root, "shared-context", "brand-voice.md"), "voice\n");
  await fs.writeFile(path.join(root, "shared-context", "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.mkdir(path.join(root, ".secrets"));
  await fs.writeFile(path.join(root, ".secrets", "token"), "nope\n");
  await fs.mkdir(path.join(root, ".git"));
  await fs.writeFile(path.join(root, ".git", "HEAD"), "ref\n");
  await fs.writeFile(path.join(outside, "leak.txt"), "outside\n");
  await fs.symlink(outside, path.join(root, "escape"));
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

describe("listWorkspaceDir", () => {
  it("lists the root with folders first and hides VCS, secrets and outside symlinks", async () => {
    const entries = await listWorkspaceDir(root, "");
    expect(entries.map((e) => `${e.kind}:${e.path}`)).toEqual([
      "dir:shared-context",
      "file:BRAND.md",
      "file:TEAM.md",
    ]);
  });

  it("lists a nested folder with workspace-relative paths and marks binaries read-only", async () => {
    const entries = await listWorkspaceDir(root, "shared-context");
    expect(entries.map((e) => e.path)).toEqual([
      "shared-context/templates",
      "shared-context/brand-voice.md",
      "shared-context/logo.png",
    ]);
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
    expect(byName["brand-voice.md"].editable).toBe(true);
    expect(byName["logo.png"].editable).toBe(false);
    expect(byName["brand-voice.md"].size).toBe(6);
  });

  it("accepts './' and trailing-slash spellings of a directory", async () => {
    expect((await listWorkspaceDir(root, "./shared-context/")).length).toBe(3);
    expect((await listWorkspaceDir(root, ".")).length).toBe(3);
  });

  it("refuses to leave the workspace or enter a hidden folder", async () => {
    await expect(listWorkspaceDir(root, "../")).rejects.toThrow(/Invalid directory/);
    await expect(listWorkspaceDir(root, "/etc")).rejects.toThrow(/Invalid directory/);
    await expect(listWorkspaceDir(root, ".secrets")).rejects.toThrow(/Invalid directory/);
    await expect(listWorkspaceDir(root, "shared-context/../../x")).rejects.toThrow(/Invalid directory/);
  });

  it("surfaces a missing folder as an error rather than an empty list", async () => {
    await expect(listWorkspaceDir(root, "does-not-exist")).rejects.toThrow();
  });
});

describe("normalizeWorkspaceDir", () => {
  it("maps root spellings to the empty string", () => {
    expect(normalizeWorkspaceDir("")).toBe("");
    expect(normalizeWorkspaceDir(".")).toBe("");
    expect(normalizeWorkspaceDir("./")).toBe("");
  });
  it("collapses duplicate separators and backslashes", () => {
    expect(normalizeWorkspaceDir("roles//lead\\notes/")).toBe("roles/lead/notes");
  });
  it("rejects traversal, absolute paths and hidden names", () => {
    expect(normalizeWorkspaceDir("..")).toBeNull();
    expect(normalizeWorkspaceDir("a/../b")).toBeNull();
    expect(normalizeWorkspaceDir("/abs")).toBeNull();
    expect(normalizeWorkspaceDir("C:/x")).toBeNull();
    expect(normalizeWorkspaceDir("node_modules/x")).toBeNull();
  });
});

describe("isEditableWorkspaceFile", () => {
  it("treats markdown, json and unknown extensions as text", () => {
    expect(isEditableWorkspaceFile("TEAM.md", 10)).toBe(true);
    expect(isEditableWorkspaceFile("team.json", 10)).toBe(true);
    expect(isEditableWorkspaceFile("Makefile", 10)).toBe(true);
  });
  it("refuses binaries and oversized files", () => {
    expect(isEditableWorkspaceFile("a.PNG", 10)).toBe(false);
    expect(isEditableWorkspaceFile("data.db", 10)).toBe(false);
    expect(isEditableWorkspaceFile("big.md", MAX_EDITABLE_BYTES + 1)).toBe(false);
  });
});
