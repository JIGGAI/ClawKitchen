import YAML from "yaml";

export function suggestIds(baseId: string): string[] {
  const b = String(baseId || "recipe").trim();
  return [`custom-${b}`, `my-${b}`, `${b}-2`, `${b}-alt`];
}

export function scaffoldCmdForKind(kind: string, toId: string): string[] | null {
  if (kind === "team") {
    return ["recipes", "scaffold-team", toId, "--team-id", toId, "--overwrite"];
  }
  if (kind === "agent") {
    return ["recipes", "scaffold", toId, "--agent-id", toId, "--overwrite"];
  }
  return null;
}

export function patchFrontmatter(
  original: string,
  toId: string,
  toName: string | undefined
): { next: string; kind: string } {
  const end = original.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Recipe frontmatter not terminated (---)");
  const yamlText = original.slice(4, end + 1);
  const fm = (YAML.parse(yamlText) ?? {}) as Record<string, unknown>;
  const kind = String(fm.kind ?? "").trim().toLowerCase();

  const teamPatch =
    kind === "team"
      ? {
          team: {
            ...(typeof fm.team === "object" && fm.team ? (fm.team as Record<string, unknown>) : {}),
            teamId: toId,
          },
        }
      : {};
  const patched: Record<string, unknown> = { ...fm, id: toId, ...(toName ? { name: toName } : {}), ...teamPatch };
  const nextYaml = YAML.stringify(patched).trimEnd();
  const next = `---\n${nextYaml}\n---\n${original.slice(end + 5)}`;
  return { next, kind };
}
