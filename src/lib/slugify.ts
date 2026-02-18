/* eslint-disable sonarjs/slow-regex -- slugify: bounded input (title/ids), no user-controlled long strings */
/**
 * Slugify a string for use in ids, file names, or URLs.
 * Normalizes to lowercase, replaces non-alphanumeric sequences with hyphens, trims edges.
 * @param maxLength - optional max length (default 80). Use 64 for goal ids.
 */
export function slugifyId(input: string, maxLength = 80): string {
  const step1 = String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "");
  const step2 = step1.replace(/[\s_-]+/g, "-").replace(/-+/g, "-");
  const step3 = step2.replace(/^-+/, "").replace(/-+$/, "");
  return step3.slice(0, maxLength);
}
/* eslint-enable sonarjs/slow-regex */
