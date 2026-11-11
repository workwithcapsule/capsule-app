/** Shared validation, matching the prototype's rules and messages. */

export function isEmail(v: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(v.trim());
}

/** Suggests a 2-letter key prefix from a space name (Engineering → EN, Partner Programs → PP). */
export function suggestPrefix(name: string, taken: string[]): string {
  const words = name.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  let p = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2))
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (p.length < 2) p = (p + "X").slice(0, 2);
  const base = p;
  let n = 0;
  while (taken.includes(p)) p = base + String.fromCharCode(65 + n++);
  return p;
}

export function prefixError(prefix: string, others: string[]): string {
  const v = prefix.trim().toUpperCase();
  if (!v) return "Add a key prefix.";
  if (!/^[A-Z]{2,4}$/.test(v)) return "Use 2 to 4 letters.";
  if (others.includes(v)) return `Another space already uses ${v}.`;
  return "";
}

/** Splits "a@x.com, b@y.com" and checks each address against the list so far. */
export function parseInvites(
  draft: string,
  existing: string[],
): { emails: string[]; error: string } {
  const parts = draft.split(/[\s,;]+/).filter(Boolean);
  const bad = parts.find((e) => !isEmail(e));
  if (bad) return { emails: [], error: `“${bad}” isn’t a valid email address.` };
  const lower = parts.map((e) => e.toLowerCase());
  const dup = lower.find((e, i) => existing.includes(e) || lower.indexOf(e) !== i);
  if (dup) return { emails: [], error: `${dup} is already on the list.` };
  return { emails: lower, error: "" };
}
