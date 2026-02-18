export function splitRecipeFrontmatter(md: string): { yamlText: string; rest: string } {
  if (!md.startsWith("---\n")) throw new Error("Recipe markdown must start with YAML frontmatter (---)");
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Recipe frontmatter not terminated (---)");
  const yamlText = md.slice(4, end + 1);
  const rest = md.slice(end + 5);
  return { yamlText, rest };
}

export function normalizeRole(role: string): string {
  const r = role.trim();
  if (!r) throw new Error("role is required");
  if (!/^[a-z][a-z0-9-]{0,62}$/i.test(r)) throw new Error("role must be alphanumeric/dash");
  return r;
}
