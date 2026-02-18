/**
 * Slugify a string for use in ids, file names, or URLs.
 * Normalizes to lowercase, replaces non-alphanumeric sequences with hyphens, trims edges.
 * Uses character-by-character processing to avoid regex ReDoS.
 * @param maxLength - optional max length (default 80). Use 64 for goal ids.
 */
export function slugifyId(input: string, maxLength = 80): string {
  const s = String(input ?? "").toLowerCase().trim();
  const cap = Math.min(s.length, maxLength * 2);
  let result = "";
  let prevHyphen = false;
  for (let i = 0; i < cap; i++) {
    const c = s[i];
    if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) {
      result += c;
      prevHyphen = false;
    } else if ((c === " " || c === "-" || c === "_") && !prevHyphen) {
      result += "-";
      prevHyphen = true;
    }
  }
  while (result.startsWith("-")) result = result.slice(1);
  while (result.endsWith("-")) result = result.slice(0, -1);
  return result.slice(0, maxLength);
}
