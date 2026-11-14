/*
 * A quick guess at which components a description involves, made in the
 * browser while you type and while Orbit plays (build-decisions.md 42). The
 * real answer comes from Claude; this only colors the beads early.
 */

const HINTS: Record<string, RegExp> = {
  tech: /\b(build|feature|bug|fix|release|integrat\w*|api|portal|tracking|app|code|deploy|engineer\w*|mfa|login|data)\b/i,
  engineering: /\b(build|feature|bug|fix|release|integrat\w*|api|portal|app|code|deploy)\b/i,
  operations: /\b(launch|roll ?out|process\w*|readiness|payouts?|handoff|operat\w*|runbook)\b/i,
  sales: /\b(sales|reps?|training|enablement|deals?|pipeline)\b/i,
  marketing: /\b(launch|announce\w*|campaign|marketing|messag\w*|newsletter|webinar)\b/i,
  support: /\b(support|help|macros?|customers?|tickets?)\b/i,
  compliance: /\b(complian\w*|polic(y|ies)|sign.?off|approv\w*|regulat\w*|retention|audit)\b/i,
  legal: /\b(legal|contracts?|terms|privacy)\b/i,
  design: /\b(design|ux|ui|redesign|pages?|mockups?)\b/i,
  finance: /\b(budget|pricing|costs?|financ\w*|payouts?|invoic\w*|billing)\b/i,
  product: /\b(product|roadmap|feature|requirements|spec)\b/i,
  qa: /\b(qa|test(ing)?|quality)\b/i,
  security: /\b(security|mfa|pen ?test|vulnerab\w*|questionnaire)\b/i,
};

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);

/** The org's components the description seems to involve, in the org's order. */
export function guessComponents<
  T extends { id: string; name: string; description?: string | null },
>(description: string, types: T[]): T[] {
  const text = description.toLowerCase();
  if (!text.trim()) return [];
  const textWords = new Set(words(text));
  return types.filter((t) => {
    const name = t.name.toLowerCase();
    if (text.includes(name)) return true;
    const hint = HINTS[name];
    if (hint?.test(text)) return true;
    // A distinctive word from the component's own description.
    return words(t.description ?? "").some((w) => w.length > 5 && textWords.has(w));
  });
}
